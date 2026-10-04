# Batch Image Resizer

A minimalist browser app for resizing batches of JPG, PNG and WebP images. Drop images into the page, choose a maximum bounding size and output format, then download the resized files individually or as a ZIP.

All processing happens locally in the browser using Canvas and browser-side encoders. Images are not uploaded to a server.

Live app hosted on Vercel:

- <https://bir.gock.net/>

## Features

- Resize multiple images at once.
- Add more images without clearing the current batch.
- Remove individual images or a selection, with undo.
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
- Compare an original, current output and previous variants in place, with 100% inspection and single-image quality trials.
- Switch between thumbnail grid and compact list views.
- Remember preferences, recent dimensions, selection, output names and download requests.
- Recover source images and committed batch settings after a reload.
- Clear saved preferences, IndexedDB, app web storage or cached results from dedicated controls.
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

Pause retains completed outputs and remains paused while you edit the batch. Resume reuses matching outputs and processes the remaining images. Clear removes the current batch; Undo removal restores it, including cached results while they remain in the bounded undo history. Removing an image or a selection can also be undone.

ZIP exports use a snapshot of the ready images at the time of the click. You can keep working while an archive is created, track its progress or cancel that export. Individual images use native download links to their output blobs; ZIPs use FileSaver. Downloads do not add a success message to the page, and the app cannot verify where the browser saved them.

Choose an image preview to compare it with the original or an available previous output. At 100%, drag either preview to pan both together; scrolling also keeps their relative positions synchronised across different image dimensions. Trial format and quality changes affect that image only until you choose Apply to batch. Previous variants use a bounded memory cache and may be evicted as you work.

If the PNG optimiser produces incomplete output, the browser's lossless PNG encoder is used instead. The image card explains that the selected palette reduction was skipped.

## Keyboard and selection

- Shift-click an image checkbox to select a range.
- With focus in the image batch, use Ctrl/Cmd+A to select all, Delete to remove the selection and Escape to clear it.
- Use Ctrl/Cmd+Z outside editable controls to undo the latest removal.
- In the comparison panel, use Left/Right to inspect adjacent images and Escape to close it.
- Apply numeric fields with Enter and restore their applied values with Escape.

## Saved data and privacy

Open **Saved data and preferences** in the footer to control storage. Remembering preferences and recovering the batch are enabled by default and can be switched off independently.

Preferences and storage choices use app-specific Local Storage keys. Source images, batch settings, pause state, selection, output names and download request markers are saved in IndexedDB after a short debounce. Outputs are regenerated after recovery. Undo history and previous output variants remain in memory only. No images are uploaded.

The panel provides separate controls to clear saved preferences, the IndexedDB batch, app Local Storage, app Session Storage, cached results and undo history, or all app data and the current batch. Clearing a saved category stops saving it and tells other open app tabs to pause saving that category too. Clearing stored data leaves the current images available unless you choose to clear all app data. Clearing cached results pauses processing until you resume.

Switching remembering off saves a minimal storage choice so it remains off next time. Clearing Local Storage removes those choices too; preference saving stays off for the current visit until enabled again. Clearing all removes both storage choices and the current batch and keeps both kinds of saving off for the visit. These controls affect only this app's data, not other applications or files already downloaded. The app does not use a service worker or Cache Storage for images.

Browser storage can be unavailable, full or evicted by the browser. Storage failures are reported without blocking work in the current tab. Recovery is a convenience, not a substitute for downloading files you want to keep.

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

Run regression tests with `pnpm test`. These use Node's test runner, mocked image allocation APIs, a simulated DOM for component interactions and an IndexedDB implementation for recovery checks. They do not run browser smoke tests.

- Vite
- Preact via React compatibility
- Canvas and `OffscreenCanvas`
- `upng-js` for PNG encoding
- `jszip` and `file-saver` for ZIP downloads
