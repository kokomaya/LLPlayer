//
// ⚠️  ON-DEVICE REFERENCE — NOT COMPILED IN CI. ⚠️
//
// The Rust half of the desktop `DesktopVideoSurface` seam. It answers the
// `invoke(...)` calls made by `src/ui/tauri-mpv-surface.example.ts` and emits
// the mpv events that binding listens for. It is sketched, not built: shipping
// it needs a Rust toolchain + a libmpv binding crate (e.g. `libmpv2`) and a real
// `tauri.conf.json`. Rename to `lib.rs` and wire into `main.rs` on a machine.
//
// The contract this file must honour is fixed by the TypeScript port
// (`src/adapters/desktop-video-surface.ts`) and proven by the Node contract
// test against `FakeDesktopVideoSurface` — so the Rust side has an exact,
// pre-tested spec to implement (times in SECONDS; end-file carries a reason).
//
// use tauri::{AppHandle, Emitter, State};
// use std::sync::Mutex;
//
// struct Mpv(Mutex<libmpv2::Mpv>); // the live libmpv handle
//
// #[tauri::command]
// fn mpv_load_file(uri: String, mpv: State<Mpv>) {
//     mpv.0.lock().unwrap().command("loadfile", &[&uri]).ok();
// }
//
// #[tauri::command]
// fn mpv_set_paused(paused: bool, mpv: State<Mpv>) {
//     mpv.0.lock().unwrap().set_property("pause", paused).ok();
// }
//
// #[tauri::command]
// fn mpv_seek_absolute(position_sec: f64, mpv: State<Mpv>) {
//     let arg = format!("{position_sec}");
//     mpv.0.lock().unwrap().command("seek", &[&arg, "absolute+exact"]).ok();
// }
//
// #[tauri::command]
// fn mpv_set_speed(rate: f64, mpv: State<Mpv>) {
//     mpv.0.lock().unwrap().set_property("speed", rate).ok();
// }
//
// #[tauri::command]
// fn mpv_destroy(mpv: State<Mpv>) {
//     mpv.0.lock().unwrap().command("stop", &[]).ok();
// }
//
// // The libmpv event loop (spawned on a worker thread) translates mpv events
// // into the exact payload shapes the TS callbacks expect:
// //
// //   MPV_EVENT_FILE_LOADED    -> app.emit("mpv:file-loaded",
// //                                  json!({ "durationSec": dur, "positionSec": 0.0 }))
// //   property "time-pos"      -> app.emit("mpv:time-pos", json!({ "positionSec": t }))
// //   MPV_EVENT_SEEK (settled) -> app.emit("mpv:seek-finished", json!({ "positionSec": t }))
// //   MPV_EVENT_END_FILE       -> app.emit("mpv:end-file",
// //                                  json!({ "reason": "eof" | "error" | "stop",
// //                                          "error": msg }))
// //
// // Note the reason mapping: mpv's EndFileReason::Eof -> "eof",
// // ::Error -> "error" (with the message), ::Stop -> "stop".
//
// #[cfg_attr(mobile, tauri::mobile_entry_point)]
// pub fn run() {
//     tauri::Builder::default()
//         .invoke_handler(tauri::generate_handler![
//             mpv_load_file, mpv_set_paused, mpv_seek_absolute, mpv_set_speed, mpv_destroy
//         ])
//         .run(tauri::generate_context!())
//         .expect("error while running tauri application");
// }
