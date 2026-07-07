#![deny(clippy::all)]

use napi_derive::napi;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode, ErrorStrategy};
use napi::{JsFunction, Result};
use std::path::Path;
use std::fs;
use std::sync::{Arc, OnceLock};
use tokio::sync::Semaphore;
use sha1::{Sha1, Digest};

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_client() -> &'static reqwest::Client {
  CLIENT.get_or_init(|| {
    reqwest::Client::builder()
      .user_agent("MinecraftOfflineLauncher/1.1.0 (contact@launcher.local)")
      .build()
      .expect("Failed to build reqwest client")
  })
}

#[napi(object)]
#[derive(Clone)]
pub struct DownloadTask {
  pub url: String,
  pub path: String,
  pub sha1: Option<String>,
}

#[napi(object)]
pub struct ProgressUpdate {
  pub task_index: u32,
  pub status: String, // "success", "skipped", "failed"
  pub error: Option<String>,
}

fn check_sha1(path: &str, expected_sha1: &str) -> bool {
  let file_path = Path::new(path);
  if !file_path.exists() {
    return false;
  }
  let mut file = match fs::File::open(file_path) {
    Ok(f) => f,
    Err(_) => return false,
  };
  let mut hasher = Sha1::new();
  if std::io::copy(&mut file, &mut hasher).is_err() {
    return false;
  }
  let hash = hasher.finalize();
  let hex_hash = hex::encode(hash);
  hex_hash.eq_ignore_ascii_case(expected_sha1)
}

async fn download_file(task: DownloadTask) -> std::result::Result<String, String> {
  // Check SHA1 if present first
  if let Some(ref sha1_val) = task.sha1 {
    if check_sha1(&task.path, sha1_val) {
      return Ok("skipped".to_string());
    }
  }

  // Create parent dir
  let file_path = Path::new(&task.path);
  if let Some(parent) = file_path.parent() {
    if let Err(e) = fs::create_dir_all(parent) {
      return Err(format!("Failed to create directories: {}", e));
    }
  }

  // Download using the global client
  let client = get_client();
  let response = client.get(&task.url)
    .send()
    .await
    .map_err(|e| format!("Request failed: {}", e))?;

  if !response.status().is_success() {
    return Err(format!("Server returned status: {}", response.status()));
  }

  let bytes = response
    .bytes()
    .await
    .map_err(|e| format!("Failed to read body: {}", e))?;

  fs::write(file_path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

  // Verify SHA1 after download if expected
  if let Some(ref sha1_val) = task.sha1 {
    if !check_sha1(&task.path, sha1_val) {
      return Err("SHA-1 mismatch after download".to_string());
    }
  }

  Ok("success".to_string())
}

#[napi(ts_args_type = "tasks: DownloadTask[], concurrency: number, callback: (err: Error | null, progress: ProgressUpdate) => void")]
pub fn download_files(
  tasks: Vec<DownloadTask>,
  concurrency: u32,
  callback: JsFunction,
) -> Result<()> {
  let tsfn: ThreadsafeFunction<ProgressUpdate, ErrorStrategy::CalleeHandled> = callback
    .create_threadsafe_function(0, |ctx| {
      let update: ProgressUpdate = ctx.value;
      Ok(vec![update])
    })?;

  let tsfn = Arc::new(tsfn);
  let semaphore = Arc::new(Semaphore::new(concurrency as usize));

  // Run in tokio runtime managed by napi-rs
  napi::tokio::spawn(async move {
    let mut join_handles = vec![];

    for (index, task) in tasks.into_iter().enumerate() {
      let sem = semaphore.clone();
      let tsfn_clone = tsfn.clone();
      let index = index as u32;

      let handle = napi::tokio::spawn(async move {
        let _permit = sem.acquire().await.unwrap();
        
        let result = download_file(task).await;
        
        let update = match result {
          Ok(status) => ProgressUpdate {
            task_index: index,
            status,
            error: None,
          },
          Err(e) => ProgressUpdate {
            task_index: index,
            status: "failed".to_string(),
            error: Some(e),
          },
        };

        let _ = tsfn_clone.call(
          Ok(update),
          ThreadsafeFunctionCallMode::Blocking,
        );
      });

      join_handles.push(handle);
    }

    for handle in join_handles {
      let _ = handle.await;
    }
  });

  Ok(())
}
