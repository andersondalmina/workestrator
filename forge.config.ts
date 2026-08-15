import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Packager writes the app's real name, icon and `ElectronAsarIntegrity` hash into
    // Info.plist *after* unpacking Electron, which invalidates the ad-hoc signature
    // Electron ships with. Apple Silicon refuses to launch a bundle whose signature
    // does not verify, so an unsigned release is not merely "unidentified developer",
    // it is unlaunchable. Re-sign ad-hoc (`-`) as the last packaging step to seal the
    // bundle as it is actually shipped. `identityValidation` is off because `-` is not
    // a certificate to look up in a keychain. This is not a Developer ID signature:
    // Gatekeeper still warns on first open, which the release notes explain.
    // Only meaningful for darwin builds; packager ignores it on other platforms.
    osxSign: {
      identity: "-",
      identityValidation: false,
      // The hardened runtime turns on library validation, which demands that every
      // loaded library carry the same Team ID as the host process. Ad-hoc signatures
      // have no Team ID at all, so the app dies in dyld loading Electron Framework.
      // The hardened runtime only buys us notarization eligibility, and we do not
      // notarize, so turn it off rather than paper over it with entitlements.
      optionsForFile: () => ({ hardenedRuntime: false }),
    },
  },
  rebuildConfig: {},
  makers: [new MakerSquirrel({}), new MakerZIP({}, ["darwin"]), new MakerRpm({}), new MakerDeb({})],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          // Each bundle is emitted as `<entry basename>.js` into `.vite/build`, so the
          // two entries must not share a basename (`package.json#main` expects `main.js`,
          // and the window loads `preload.js` next to it).
          entry: "src/main/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          // `.mts` so the ESM-only `@tailwindcss/vite` plugin can be imported.
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
