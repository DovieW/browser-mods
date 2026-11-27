use serde_json::{json, Value};
use std::{
    env, fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

mod backend;

const HOST: &str = "com.doview.browser_mods";
const VERSION: &str = env!("CARGO_PKG_VERSION");

fn extension_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|c| (b'a'..=b'p').contains(&c))
}

fn read_request(mut input: impl Read) -> io::Result<Value> {
    let mut size = [0; 4];
    input.read_exact(&mut size)?;
    let size = u32::from_ne_bytes(size) as usize;
    if !(1..=128).contains(&size) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid message size",
        ));
    }
    let mut body = vec![0; size];
    input.read_exact(&mut body)?;
    Ok(serde_json::from_slice(&body)?)
}

fn respond(mut output: impl Write, message: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(message)?;
    output.write_all(&(body.len() as u32).to_ne_bytes())?;
    output.write_all(&body)?;
    output.flush()
}

fn handle(input: impl Read, send: fn() -> Result<(), &'static str>) -> Value {
    match read_request(input) {
        Ok(value) if value == json!({"action":"status"}) => {
            json!({"ok":true,"version":VERSION,"ready":backend::ready()})
        }
        Ok(value) if value == json!({"action":"bitwarden-autofill"}) => match send() {
            Ok(()) => json!({"ok":true}),
            Err(code) => json!({"ok":false,"code":code}),
        },
        _ => json!({"ok":false,"code":"invalid_request"}),
    }
}

fn install(id: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if !extension_id(id) {
        return Err("Expected the 32-character Browser Mods extension ID".into());
    }
    let (install_dir, manifest_dir) = backend::install_paths()?;
    fs::create_dir_all(&install_dir)?;
    fs::create_dir_all(&manifest_dir)?;
    let source = env::current_exe()?;
    let binary = install_dir.join(format!("browser-mods-helper{}", env::consts::EXE_SUFFIX));
    if source != binary {
        let staged = install_dir.join(format!("browser-mods-helper.{}.tmp", std::process::id()));
        fs::copy(&source, &staged)?;
        fs::rename(staged, &binary)?;
    }
    let manifest = manifest_dir.join(format!("{HOST}.json"));
    let staged = manifest.with_extension(format!("{}.tmp", std::process::id()));
    fs::write(
        &staged,
        serde_json::to_vec_pretty(&json!({
            "name":HOST,
            "description":"Browser Mods Bitwarden shortcut helper",
            "path":binary,
            "type":"stdio",
            "allowed_origins":[format!("chrome-extension://{id}/")]
        }))?,
    )?;
    fs::rename(staged, &manifest)?;
    backend::register(&manifest)?;
    Ok(manifest)
}

fn configured_caller(argument: &str) -> bool {
    let Ok((_, directory)) = backend::install_paths() else {
        return false;
    };
    let manifest = directory.join(format!("{HOST}.json"));
    let Some(id) = argument.strip_prefix("chrome-extension://") else {
        return false;
    };
    let Some(id) = id.strip_suffix("/") else {
        return false;
    };
    if !extension_id(id) {
        return false;
    }
    let Ok(data) = fs::read(manifest) else {
        return false;
    };
    let Ok(value) = serde_json::from_slice::<Value>(&data) else {
        return false;
    };
    value["allowed_origins"] == json!([argument])
}

fn main() -> ExitCode {
    let args: Vec<_> = env::args().skip(1).collect();
    match args.as_slice() {
        [command, id] if command == "install" => match install(id) {
            Ok(manifest) => {
                println!("Installed {}", manifest.display());
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        },
        [command] if command == "--version" => {
            println!("Browser Mods helper {VERSION}");
            ExitCode::SUCCESS
        }
        [caller, ..] if configured_caller(caller) => {
            let message = handle(io::stdin().lock(), backend::send);
            if respond(io::stdout().lock(), &message).is_ok() {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        _ => {
            eprintln!(
                "Usage: {} install EXTENSION_ID",
                Path::new(&env::args().next().unwrap_or_default()).display()
            );
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_framing_and_only_accepts_the_fixed_shortcut() {
        fn sent() -> Result<(), &'static str> {
            Ok(())
        }
        fn unexpected() -> Result<(), &'static str> {
            panic!("Invalid input sent a shortcut")
        }
        let mut frame = Vec::new();
        respond(&mut frame, &json!({"action":"bitwarden-autofill"})).unwrap();
        assert_eq!(handle(frame.as_slice(), sent), json!({"ok":true}));
        frame.clear();
        respond(
            &mut frame,
            &json!({"action":"bitwarden-autofill","key":"A"}),
        )
        .unwrap();
        assert_eq!(
            handle(frame.as_slice(), unexpected)["code"],
            "invalid_request"
        );
        assert_eq!(
            handle([255u8; 4].as_slice(), unexpected)["code"],
            "invalid_request"
        );
    }
}
