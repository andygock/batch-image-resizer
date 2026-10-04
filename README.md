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
- Advanced output modal with per-format settings, presets, Apply/Cancel and reset controls.
- Optional local libwebp and MozJPEG encoders, plus PNG dithering and OxiPNG optimisation.
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

Custom dimensions must be whole numbers from 1 to 8192, with a maximum bounding area of 16,777,216 pixels. Edit both dimensions, then apply them with Enter or by leaving the dimension group. Escape restores the applied values. Invalid drafts explain the correction and block downloads until fixed. Transparent images exported to JPEG use a configurable background, white by default; PNG and WebP retain transparency. Encoder failures are reported rather than downloading files with misleading extensions.

Pause retains completed outputs and remains paused while you edit the batch. Resume reuses matching outputs and processes the remaining images. Clear removes the current batch and keeps your preferences. Deleting an image or a selection removes its source, output and selection state. Deletion cannot be undone.

ZIP exports use a snapshot of the ready images at the time of the click. You can keep working while an archive is created, track its progress or cancel that export. Deleting images cancels an active export so it cannot download deleted outputs. Individual images use native download links to their output blobs; ZIPs use FileSaver. Downloads do not add a success message to the page, and the app cannot verify where the browser saved them.

Choose an image preview to compare it with the original. At 100%, drag either preview to pan both together; scrolling also keeps their relative positions synchronised across different image dimensions. Trial format and quality changes affect that image only until you choose Apply to batch.

If standard PNG encoding produces incomplete output, the browser's lossless PNG encoder is used instead. The image card explains that the selected palette reduction was skipped.

## Advanced output settings

Open **Advanced → Image processing** for resize quality controls. Auto uses the browser's high-quality resizer; nearest-neighbour keeps pixel-art edges hard. Lanczos3 favours sharp detail and Mitchell gives softer edges. Both advanced methods support optional linear-light and alpha-aware filtering in a cancellable local worker, with a 33.5-megapixel source limit. Settings are saved with preferences and can be trialled in the comparison panel. Changes remain staged until the parent settings are applied.

Choose **Advanced** next to the format controls. The modal keeps separate settings for WebP, JPEG and PNG. Changing the modal's format section does not change the batch output format. Edits take effect together with **Apply settings**; Cancel, Escape and closing the modal discard them. Each format has a reset button. Less common encoder controls are under **Fine tuning**.

JPEG and WebP use the browser encoder by default. Select **Advanced** in the format's Encoder menu to use the additional controls. These encoders and their WebAssembly files load from the app's own assets on demand and run in cancellable workers. Images never leave the device. Higher effort settings can take substantially longer, especially for large batches.

| Format | Available advanced controls |
| --- | --- |
| WebP | Lossy, lossless and near-lossless modes; encoding effort; lossless compression effort; near-lossless fidelity; image hints; transparency quality and filtering; preservation of invisible RGB; sharper colour conversion; spatial noise shaping; deblocking strength, sharpness and automatic filtering; analysis passes; target file size; lower-memory encoding; photo, drawing and text starting presets. |
| JPEG | Background colour with either encoder; progressive or sequential output; entropy coding optimisation for sequential output; greyscale; automatic, 4:4:4 or 4:2:0 chroma subsampling; separate chroma quality; input smoothing; quantisation tables; trellis optimisation controls; fast, balanced and best-compression starting presets. |
| PNG | Lossless colours or palettes from 2 to 256 colours; Riemersma dithering strength for reduced palettes; OxiPNG compression effort; Adam7 interlacing; optional optimisation of RGB values beneath fully transparent pixels. |

Lossless describes the resized pixels, not preservation of the original dimensions. WebP lossless compression effort controls processing time and size, not visual quality. The usual WebP quality control is hidden in lossless and near-lossless modes and when targeting file size. WebP size targets use decimal KB (1 KB = 1000 bytes), override ordinary quality, and are best effort rather than hard limits; an output above its target carries a warning. Targeting uses at least six analysis passes.

PNG compression effort preserves pixels after any palette reduction. Palette reduction and dithering can change colours and transparency. Interlacing can increase file size. Invisible RGB optimisation is optional because it changes hidden pixel values. When advanced PNG processing is requested, a damaged intermediate PNG is recovered where possible without dropping those settings; otherwise an error is shown. Advanced JPEG/WebP failures also remain errors rather than silently switching to the browser encoder.

The comparison panel has its own **Advanced** button. **Apply to trial** updates only that preview; **Apply to batch** then commits the trial settings to the batch. Advanced preferences follow the existing preference-saving controls, and changing a format's settings reuses completed outputs for unaffected formats.

## Keyboard and selection

- Shift-click an image checkbox to select a range.
- With focus in the image batch, use Ctrl/Cmd+A to select all, Delete to remove the selection and Escape to clear it.
- In the comparison panel, use Left/Right to inspect adjacent images and Escape to close it.
- Apply numeric fields with Enter and restore their applied values with Escape.

## Saved data and privacy

Open **Saved preferences** using the toolbar gear to control preference saving, which is enabled by default.

Menu options, including dimensions, output format, quality, advanced encoder settings, filename suffix, recent sizes and view mode, use one app-specific Local Storage key. Images and outputs stay in memory for the current tab. Reloading or closing the tab discards the batch, selection and output names. No images are uploaded.

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

Run regression tests with `pnpm test`. These use Node's test runner, mocked image allocation APIs, real local WebAssembly codec round trips and a simulated DOM for component interactions. They do not run browser smoke tests or fetch encoder assets from the network.

Run `pnpm test:build` to build the production app and execute its emitted worker modules and lazy codec chunks directly in Node. This checks bundled WASM asset paths and catches production-only module interop failures without a browser.

- Vite
- Preact via React compatibility
- Canvas and `OffscreenCanvas`
- `upng-js` for PNG encoding
- `image-q` for PNG palette dithering
- `@jsquash/webp`, `@jsquash/jpeg` and `@jsquash/oxipng` for local advanced encoding and optimisation
- `jszip` and `file-saver` for ZIP downloads

## Favicon

Favicon is from Fluent UI Emoji artwork © Microsoft Corporation: https://github.com/microsoft/fluentui-emoji · Licence: MIT https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE
