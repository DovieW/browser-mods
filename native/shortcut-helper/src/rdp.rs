use std::io;

#[cfg(target_os = "linux")]
use std::collections::HashSet;

#[cfg(target_os = "linux")]
pub fn active() -> io::Result<bool> {
    use std::{fs, os::unix::fs::MetadataExt};

    let uid = fs::metadata("/proc/self")?.uid();
    let mut sockets = HashSet::new();
    for process in fs::read_dir("/proc")?.flatten() {
        if !process
            .file_name()
            .as_encoded_bytes()
            .iter()
            .all(u8::is_ascii_digit)
            || !process.metadata().is_ok_and(|meta| meta.uid() == uid)
            || !fs::read_to_string(process.path().join("comm"))
                .is_ok_and(|name| name.trim_end() == "remmina")
        {
            continue;
        }
        let descriptors = match fs::read_dir(process.path().join("fd")) {
            Ok(descriptors) => descriptors,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        for descriptor in descriptors.flatten() {
            if let Ok(link) = fs::read_link(descriptor.path()) {
                if let Some(inode) = link.to_str().and_then(socket_inode) {
                    sockets.insert(inode);
                }
            }
        }
    }
    if sockets.is_empty() {
        return Ok(false);
    }
    for table in ["/proc/self/net/tcp", "/proc/self/net/tcp6"] {
        match fs::read_to_string(table) {
            Ok(snapshot) if socket_connected(&snapshot, &sockets) => return Ok(true),
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound && table.ends_with("tcp6") => {}
            Err(error) => return Err(error),
        }
    }
    Ok(false)
}

#[cfg(target_os = "linux")]
fn socket_inode(link: &str) -> Option<u64> {
    link.strip_prefix("socket:[")?
        .strip_suffix(']')?
        .parse()
        .ok()
}

#[cfg(target_os = "linux")]
fn socket_connected(table: &str, sockets: &HashSet<u64>) -> bool {
    table.lines().skip(1).any(|line| {
        let mut columns = line.split_whitespace().skip(2);
        let Some((_, port)) = columns.next().and_then(|peer| peer.rsplit_once(':')) else {
            return false;
        };
        columns.next() == Some("01")
            && matches!(u16::from_str_radix(port, 16), Ok(443 | 3389))
            && columns
                .nth(5)
                .and_then(|inode| inode.parse().ok())
                .is_some_and(|inode| sockets.contains(&inode))
    })
}

#[cfg(target_os = "windows")]
pub fn active() -> io::Result<bool> {
    use std::{collections::HashSet, ffi::OsString, os::windows::ffi::OsStringExt, path::Path};
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        NetworkManagement::IpHelper::{
            MIB_TCP6ROW_OWNER_PID, MIB_TCP6TABLE_OWNER_PID, MIB_TCPROW_OWNER_PID,
            MIB_TCPTABLE_OWNER_PID, MIB_TCP_STATE_ESTAB,
        },
        Networking::WinSock::{AF_INET, AF_INET6},
        System::{
            RemoteDesktop::ProcessIdToSessionId,
            Threading::{
                GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
    };

    let mut session = 0;
    if unsafe { ProcessIdToSessionId(GetCurrentProcessId(), &mut session) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let mut checked = HashSet::new();
    let mut is_rdp_client = |(state, port, pid): (u32, u32, u32)| {
        if state != MIB_TCP_STATE_ESTAB as u32
            || !matches!(u16::from_be(port as u16), 443 | 3389)
            || !checked.insert(pid)
        {
            return false;
        }
        let mut owner_session = 0;
        if unsafe { ProcessIdToSessionId(pid, &mut owner_session) } == 0 || owner_session != session
        {
            return false;
        }
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process.is_null() {
            return false;
        }
        let mut executable = [0u16; 32768];
        let mut size = executable.len() as u32;
        let found =
            unsafe { QueryFullProcessImageNameW(process, 0, executable.as_mut_ptr(), &mut size) };
        unsafe { CloseHandle(process) };
        found != 0
            && Path::new(&OsString::from_wide(&executable[..size as usize]))
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("mstsc.exe"))
    };

    Ok(any_tcp_row(
        AF_INET.into(),
        std::mem::offset_of!(MIB_TCPTABLE_OWNER_PID, table),
        |row: MIB_TCPROW_OWNER_PID| is_rdp_client((row.dwState, row.dwRemotePort, row.dwOwningPid)),
    )? || any_tcp_row(
        AF_INET6.into(),
        std::mem::offset_of!(MIB_TCP6TABLE_OWNER_PID, table),
        |row: MIB_TCP6ROW_OWNER_PID| {
            is_rdp_client((row.dwState, row.dwRemotePort, row.dwOwningPid))
        },
    )?)
}

#[cfg(target_os = "windows")]
fn any_tcp_row<Row: Copy>(
    family: u32,
    rows_offset: usize,
    predicate: impl FnMut(Row) -> bool,
) -> io::Result<bool> {
    use windows_sys::Win32::{
        Foundation::ERROR_INSUFFICIENT_BUFFER,
        NetworkManagement::IpHelper::{GetExtendedTcpTable, TCP_TABLE_OWNER_PID_CONNECTIONS},
    };

    let mut bytes = 0u32;
    let mut words = Vec::<u32>::new();
    for _ in 0..3 {
        let buffer = if words.is_empty() {
            std::ptr::null_mut()
        } else {
            words.as_mut_ptr().cast()
        };
        let status = unsafe {
            GetExtendedTcpTable(
                buffer,
                &mut bytes,
                0,
                family,
                TCP_TABLE_OWNER_PID_CONNECTIONS,
                0,
            )
        };
        if status == ERROR_INSUFFICIENT_BUFFER && (4..=8 * 1024 * 1024).contains(&bytes) {
            words.resize((bytes as usize).div_ceil(size_of::<u32>()), 0);
            continue;
        }
        if status != 0 {
            return Err(io::Error::from_raw_os_error(status as i32));
        }
        let count = words.first().copied().unwrap_or(0) as usize;
        let available = (bytes as usize)
            .min(words.len() * size_of::<u32>())
            .saturating_sub(rows_offset);
        if count > available / size_of::<Row>() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid TCP table",
            ));
        }
        // Both Windows row types are C structs of integers with no invalid bit patterns.
        let table = words.as_ptr().cast::<u8>();
        return Ok((0..count)
            .map(|index| unsafe {
                table
                    .add(rows_offset + index * size_of::<Row>())
                    .cast::<Row>()
                    .read_unaligned()
            })
            .any(predicate));
    }
    Err(io::Error::other("TCP table kept changing"))
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn matches_established_owned_ipv4_and_ipv6_rdp_sockets() {
        let table = "header\n 0: 0100007F:8888 0200007F:0D3D 01 0:0 0:0 0 1000 0 42\n 1: 00000000:8888 00000000:01BB 01 0:0 0:0 0 1000 0 43";
        let ipv6 = "header\n 0: 00000000000000000000000001000000:8888 00000000000000000000000002000000:01BB 01 0:0 0:0 0 1000 0 44";
        assert_eq!(socket_inode("socket:[42]"), Some(42));
        assert_eq!(socket_inode("file:[42]"), None);
        assert!(!socket_connected(table, &HashSet::new()));
        assert!(!socket_connected(table, &HashSet::from([80])));
        assert!(!socket_connected(
            &table.replace(" 01 ", " 06 "),
            &HashSet::from([42, 43])
        ));
        assert!(socket_connected(table, &HashSet::from([42])));
        assert!(socket_connected(ipv6, &HashSet::from([44])));
    }
}
