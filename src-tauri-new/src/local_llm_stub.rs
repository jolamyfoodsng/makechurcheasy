use serde::{Deserialize, Serialize};
use std::path::Path;

const LOCAL_LLM_MODEL_NAME: &str = "Qwen2.5-1.5B-Instruct Q4_K_M";

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalLlmGenerationRequest {
    pub system_prompt: String,
    pub prompt: String,
    pub max_tokens: Option<u32>,
    pub stop: Option<Vec<String>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalLlmRuntimeStatus {
    pub model_ready: bool,
    pub model_name: String,
    pub model_path: Option<String>,
    pub expected_path: String,
    pub install_source_path: Option<String>,
    pub install_action_available: bool,
    pub loaded: bool,
}

fn disabled_status() -> LocalLlmRuntimeStatus {
    LocalLlmRuntimeStatus {
        model_ready: false,
        model_name: LOCAL_LLM_MODEL_NAME.to_string(),
        model_path: None,
        expected_path: String::new(),
        install_source_path: None,
        install_action_available: false,
        loaded: false,
    }
}

pub(crate) fn seed_local_llm_model_from_bundle(_resource_dir: &Path) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub(crate) fn get_local_llm_runtime_status() -> Result<LocalLlmRuntimeStatus, String> {
    Ok(disabled_status())
}

#[tauri::command]
pub(crate) fn install_local_llm_model(
    _source_path: Option<String>,
) -> Result<LocalLlmRuntimeStatus, String> {
    Err("Local AI helper is unavailable on this platform.".to_string())
}

#[tauri::command]
pub(crate) async fn generate_local_llm_text(
    request: LocalLlmGenerationRequest,
) -> Result<String, String> {
    let _ = (
        request.system_prompt,
        request.prompt,
        request.max_tokens,
        request.stop,
    );
    Err("Local AI helper is unavailable on this platform.".to_string())
}
