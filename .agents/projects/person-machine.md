# Person's machine

`PROJECTS.md` points here.

Work needing the person's PC (local tools) runs on GLADOS, a Windows PC: threads start a Remote
Control session (`start_remote_control`). Build Android from Windows, not WSL (no Android SDK or Java
there).

Android checks run a development build on GLADOS's one emulator: ask the other chess threads before
using it. `expo prebuild --clean` drops `cmake.dir` from `android/local.properties`; put
`cmake.dir=C:\Program Files\CMake` back, or Gradle fails on Windows' path-length limit.

A release build (`gradlew assembleRelease` or `bundleRelease`) runs out of memory on GLADOS with the
defaults. Cap Metro's workers in `android/app/build.gradle` (`extraPackagerArgs = ["--max-workers",
"2"]` in the `react` block) and run Gradle with `--max-workers=1 -Dorg.gradle.parallel=false`.

Git on Windows has no GitHub sign-in there; WSL's `gh` does. To push from GLADOS, run
`git -c credential.helper='!gh auth git-credential' push` in WSL.
