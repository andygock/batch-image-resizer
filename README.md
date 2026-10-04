# Batch Image Resizer

A minimalist browser app for resizing batches of JPG, PNG and WebP images. Drop images into the page, choose a maximum bounding size and output format, then download the resized files individually or as a ZIP.

All processing happens locally in the browser using Canvas and browser-side encoders. Images are not uploaded to a server.

Live app hosted on Vercel:

- <https://bir.gock.net/>

## Features

- Resize multiple images at once.
- Add more images without clearing the current batch.
- Permanently delete individual images or a selection.
- Drag and drop files anywhere on the page or paste images.
- Check image signatures and skip identical files, with an option to add duplicates anyway.
- Resize into a bounding box while preserving aspect ratio.
- Optional setting to avoid enlarging smaller source images.
- Keep each source format by default, or convert to JPEG, PNG or WebP.
- Independent JPEG/WebP quality sliders and percentage fields.
- PNG colour optimisation options.
- Optional filename suffix for generated files.
- Download each ready image individually, or export all ready images or a selection as a ZIP.
- Batch summary showing output size and savings.
- Pause and resume processing, with per-image progress, inline retries and reuse of unchanged outputs.
- Keep source cards and completed images usable while other images process.
- Compare an original and current output in place, with 100% inspection and single-image quality trials.
- Switch between thumbnail grid and compact list views.
- Remember menu preferences and recent dimensions in Local Storage.
- Clear the current batch or saved preferences with dedicated controls.
- Keep settings and primary actions in one sticky toolbar row; scroll settings horizontally when space is limited.
- Collision-free filenames for individual downloads and ZIP entries.
- PNG encoding in a local browser worker; no server-side image processing.

## Usage

1. Drop images onto the page or select `Load images`.
2. Choose the maximum output size.
3. Pick the output format and quality settings.
4. Add or remove images as needed.
5. Download individual files or use `Download ZIP`.

The selected size is a maximum bounding box, not a crop. For example, a 1200x800 image resized to 512x512 becomes 512x341.

Custom dimensions must be whole numbers from 1 to 8192, with a maximum bounding area of 16,777,216 pixels. Edit both dimensions, then apply them with Enter or by leaving the dimension group. Escape restores the applied values. Invalid drafts explain the correction and block downloads until fixed. Transparent images exported to JPEG use a white background; PNG and WebP retain transparency. Browser encoder failures are reported rather than downloading files with misleading extensions.

Pause retains completed outputs and remains paused while you edit the batch. Resume reuses matching outputs and processes the remaining images. Clear removes the current batch and keeps your preferences. Deleting an image or a selection removes its source, output and selection state. Deletion cannot be undone.

ZIP exports use a snapshot of the ready images at the time of the click. You can keep working while an archive is created, track its progress or cancel that export. Deleting images cancels an active export so it cannot download deleted outputs. Individual images use native download links to their output blobs; ZIPs use FileSaver. Downloads do not add a success message to the page, and the app cannot verify where the browser saved them.

Choose an image preview to compare it with the original. At 100%, drag either preview to pan both together; scrolling also keeps their relative positions synchronised across different image dimensions. Trial format and quality changes affect that image only until you choose Apply to batch.

If the PNG optimiser produces incomplete output, the browser's lossless PNG encoder is used instead. The image card explains that the selected palette reduction was skipped.

## Keyboard and selection

- Shift-click an image checkbox to select a range.
- With focus in the image batch, use Ctrl/Cmd+A to select all, Delete to remove the selection and Escape to clear it.
- In the comparison panel, use Left/Right to inspect adjacent images and Escape to close it.
- Apply numeric fields with Enter and restore their applied values with Escape.

## Saved data and privacy

Open **Saved preferences** using the toolbar gear to control preference saving, which is enabled by default.

Menu options, including dimensions, output format, quality, filename suffix, recent sizes and view mode, use one app-specific Local Storage key. Images and outputs stay in memory for the current tab. Reloading or closing the tab discards the batch, selection and output names. No images are uploaded.

The panel lets you switch preference saving off or clear saved preferences. Switching saving off remembers that choice without retaining your menu settings. Clearing saved preferences keeps the current settings and images and pauses saving until you enable it again. The toolbar Clear button only removes the current batch.

Storage failures are reported without blocking work in the current tab. These controls affect only this app's preferences, not other applications or files already downloaded.

## Development

Install dependencies:

```sh
pnpm install
```

Run the local dev server:

```sh
pnpm dev
```

Build for production:

```sh
pnpm build
```

Run Biome linting:

```sh
pnpm lint
```

Format all supported files with Biome:

```sh
pnpm format
```

Check formatting without changing files with `pnpm format:check`, or run linting,
formatting and import-order checks together with `pnpm check`.

Biome uses two-space indentation and respects `.gitignore`. The configuration
keeps the existing unused-variable and blank-target exceptions, and allows
intentional hook dependencies that reset state when the selected image changes.
Additional accessibility, callback-style and CSS specificity rules are disabled
to keep this tooling migration focused on the existing behaviour.

Preview the production build:

```sh
pnpm preview
```

## Tech

Run regression tests with `pnpm test`. These use Node's test runner, mocked image allocation APIs and a simulated DOM for component interactions. They do not run browser smoke tests.

- Vite
- Preact via React compatibility
- Canvas and `OffscreenCanvas`
- `upng-js` for PNG encoding
- `jszip` and `file-saver` for ZIP downloads

## Favicon

Favicon is from Fluent UI Emoji artwork © Microsoft Corporation: https://github.com/microsoft/fluentui-emoji · Licence: MIT https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE
