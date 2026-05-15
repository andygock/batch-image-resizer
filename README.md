# Batch Image Resizer

A minimalist browser app for resizing batches of JPG, PNG and WebP images. Drop images into the page, choose a maximum bounding size and output format, then download the resized files individually or as a ZIP.

All processing happens locally in the browser using Canvas and browser-side encoders. Images are not uploaded to a server.

Live app hosted on Vercel:

- <https://bir.gock.net/>

## Features

- Resize multiple images at once.
- Add more images without clearing the current batch.
- Remove individual images from the batch.
- Drag and drop files anywhere on the page.
- Resize into a bounding box while preserving aspect ratio.
- Optional setting to avoid enlarging smaller source images.
- Output to JPEG, PNG or WebP.
- JPEG/WebP quality controls.
- PNG color optimisation options.
- Optional filename suffix for generated files.
- Download each image individually or download all resized images as a ZIP.
- Batch summary showing output size and savings.

## Usage

1. Drop images onto the page or select `Load images`.
2. Choose the maximum output size.
3. Pick the output format and quality settings.
4. Add or remove images as needed.
5. Download individual files or use `Download ZIP`.

The selected size is a maximum bounding box, not a crop. For example, a 1200x800 image resized to 512x512 becomes 512x341.

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

Run linting:

```sh
pnpm lint
```

Preview the production build:

```sh
pnpm preview
```

## Tech

- Vite
- Preact via React compatibility
- Canvas and `OffscreenCanvas`
- `upng-js` for PNG encoding
- `jszip` and `file-saver` for ZIP downloads
