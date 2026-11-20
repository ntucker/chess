# Person's machine

`PROJECTS.md` points here.

Work needing the person's PC (local tools) runs on GLADOS, a Windows PC: threads start a Remote
Control session (`start_remote_control`). Build Android from Windows, not WSL (no Android SDK or Java
there). PRs touching Android-only code (native modules or config, worklets like
`src/maia/runNetwork.ts`, `android` branches of `Platform.OS`) say "untested on Android".
