use std::{
    env, io,
    path::{Path, PathBuf},
    process::Command,
};

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
compile_error!("Browser Mods helper supports Kubuntu and Windows");

fn variable(name: &str) -> io::Result<PathBuf> {
    env::var_os(name)
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("{name} is unset")))
}

#[cfg(target_os = "linux")]
pub fn install_paths() -> io::Result<(PathBuf, PathBuf)> {
    let home = variable("HOME")?;
    let config = env::var_os("XDG_CONFIG_HOME").map_or_else(|| home.join(".config"), PathBuf::from);
    Ok((
        home.join(".local/lib/browser-mods"),
        config.join("google-chrome/NativeMessagingHosts"),
    ))
}

#[cfg(target_os = "linux")]
pub fn register(_: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(target_os = "linux")]
fn socket() -> Option<PathBuf> {
    use std::os::unix::fs::{FileTypeExt, MetadataExt};
    let path = variable("XDG_RUNTIME_DIR").ok()?.join(".ydotool_socket");
    let meta = path.symlink_metadata().ok()?;
    let session = path.parent()?.metadata().ok()?;
    (meta.file_type().is_socket() && meta.uid() == session.uid() && meta.mode() & 0o077 == 0)
        .then_some(path)
}

#[cfg(target_os = "linux")]
pub fn ready() -> bool {
    Path::new("/usr/bin/ydotool").is_file() && socket().is_some()
}

#[cfg(target_os = "linux")]
pub fn send() -> Result<(), &'static str> {
    use std::{
        process::Stdio,
        thread,
        time::{Duration, Instant},
    };
    let socket = socket().ok_or("input_unavailable")?;
    let mut child = Command::new("/usr/bin/ydotool")
        .env("YDOTOOL_SOCKET", socket)
        .args(["key", "29:1", "42:1", "25:1", "25:0", "42:0", "29:0"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "input_unavailable")?;
    let end = Instant::now() + Duration::from_secs(2);
    while Instant::now() < end {
        if let Ok(Some(status)) = child.try_wait() {
            return if status.success() {
                Ok(())
            } else {
                Err("input_unavailable")
            };
        }
        thread::sleep(Duration::from_millis(10));
    }
    let _ = child.kill();
    let _ = child.wait();
    Err("input_unavailable")
}

#[cfg(target_os = "windows")]
pub fn install_paths() -> io::Result<(PathBuf, PathBuf)> {
    let directory = variable("LOCALAPPDATA")?
        .join("Browser Mods")
        .join("Helper");
    Ok((directory.clone(), directory))
}

#[cfg(target_os = "windows")]
pub fn register(manifest: &Path) -> io::Result<()> {
    let registry = format!(
        r"HKCU\Software\Google\Chrome\NativeMessagingHosts\{}",
        crate::HOST
    );
    let status = Command::new(variable("SystemRoot")?.join("System32").join("reg.exe"))
        .args(["add", &registry, "/ve", "/t", "REG_SZ", "/d"])
        .arg(manifest)
        .args(["/f"])
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other("Chrome registration failed"))
    }
}

#[cfg(target_os = "windows")]
pub fn ready() -> bool {
    true
}

#[cfg(target_os = "windows")]
pub fn send() -> Result<(), &'static str> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt, ptr};
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::{
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL,
                VK_P, VK_SHIFT,
            },
            WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
        },
    };
    let foreground = unsafe { GetForegroundWindow() };
    let mut pid = 0;
    if foreground.is_null() || unsafe { GetWindowThreadProcessId(foreground, &mut pid) } == 0 {
        return Err("chrome_not_focused");
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        return Err("chrome_not_focused");
    }
    let mut executable = [0u16; 32768];
    let mut size = executable.len() as u32;
    let found =
        unsafe { QueryFullProcessImageNameW(process, 0, executable.as_mut_ptr(), &mut size) };
    unsafe {
        CloseHandle(process);
    }
    if found == 0
        || !Path::new(&OsString::from_wide(&executable[..size as usize]))
            .file_name()
            .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("chrome.exe"))
    {
        return Err("chrome_not_focused");
    }
    let keys = [
        (VK_CONTROL, false),
        (VK_SHIFT, false),
        (VK_P, false),
        (VK_P, true),
        (VK_SHIFT, true),
        (VK_CONTROL, true),
    ]
    .map(|(key, released)| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: if released { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    });
    if unsafe { GetForegroundWindow() } != foreground || foreground == ptr::null_mut() {
        return Err("chrome_not_focused");
    }
    if unsafe { SendInput(keys.len() as u32, keys.as_ptr(), size_of::<INPUT>() as i32) }
        != keys.len() as u32
    {
        return Err("input_unavailable");
    }
    Ok(())
}
