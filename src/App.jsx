import { saveAs } from "file-saver";
import JSZip from "jszip";
import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import CompressionSelect from "./CompressionSelect";
import OutputImages from "./OutputImages";
import SizeSelect from "./SizeSelect";
import { useDragAndDrop } from "./useDragAndDrop";
import Errors from "./Errors";

function App() {
  const [images, setImages] = useState([]);
  const [resizedImages, setResizedImages] = useState([]);
  const [errors, setErrors] = useState([]);
  const [boundingBox, setBoundingBox] = useState({ width: 512, height: 512 });
  const [compressionLevel, setCompressionLevel] = useState(0.8); // Default compression level
  const [allowDownload, setAllowDownload] = useState(false);
  const [autoRegenerate, setAutoRegenerate] = useState(true);
  const [enableSuffix, setEnableSuffix] = useState(true);
  const [suffix, setSuffix] = useState("_small");
  const [disableUpscale, setDisableUpscale] = useState(true);
  const [processingTime, setProcessingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const dropRef = useRef(null);

  const handleFileInputChange = (event) => {
    const files = event.target.files;
    if (files) {
      handleImageUpload(files);
    }
  };

  const handleImageUpload = (files) => {
    const newErrors = [];
    const newImages = [];

    for (const file of files) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        newErrors.push(`File "${file.name}" is not a JPEG, PNG or WebP image.`);
        continue;
      }
      newImages.push(file);
    }

    // don't append images, just replace
    // perhaps in the future, we can update this so users can add one image at a time
    setErrors(newErrors);
    setImages(newImages);
  };

  // drag and drop handling
  useDragAndDrop(dropRef, handleImageUpload);

  const handleResize = useCallback(async () => {
    const resizedImagesTemp = [];

    setProcessingTime(0);
    setIsProcessing(true);

    // Start the timer
    const startTime = performance.now();

    for (const imageFile of images) {
      // get filesize of original image
      const filesizeBefore = imageFile.size;

      // https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap
      try {
        const img = await createImageBitmap(imageFile);

        // Calculate the aspect ratio of the original image
        const imgAspectRatio = img.width / img.height;

        // Calculate the aspect ratio of the bounding box
        const boundingBoxAspectRatio = boundingBox.width / boundingBox.height;

        let canvasWidth, canvasHeight;

        // If the image's aspect ratio is greater than the bounding box's aspect ratio
        // then the image's width will be the limiting factor
        if (imgAspectRatio > boundingBoxAspectRatio) {
          canvasWidth = disableUpscale
            ? Math.min(boundingBox.width, img.width)
            : boundingBox.width;
          canvasHeight = disableUpscale
            ? Math.min(boundingBox.width / imgAspectRatio, img.height)
            : boundingBox.width / imgAspectRatio;
        } else {
          // Otherwise, the image's height will be the limiting factor
          canvasHeight = disableUpscale
            ? Math.min(boundingBox.height, img.height)
            : boundingBox.height;
          canvasWidth = disableUpscale
            ? Math.min(boundingBox.height * imgAspectRatio, img.width)
            : boundingBox.height * imgAspectRatio;
        }

        // set flag to indicate if image is upscaled
        const isUpscaled = img.width > canvasWidth || img.height > canvasHeight;

        // canvas width and height need to be floored to integers
        canvasWidth = Math.floor(canvasWidth);
        canvasHeight = Math.floor(canvasHeight);

        // Create an offscreen canvas and create out images there
        const offscreenCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
        const ctx = offscreenCanvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

        // convert to blob, jpeg
        const blob = await offscreenCanvas.convertToBlob({
          type: "image/jpeg",
          quality: compressionLevel,
        });

        // get size of blob in bytes
        const blobSize = blob.size;

        // Add the resized image to the ZIP file
        const filename = imageFile.name;

        // Add the resized image to the array of resized images
        resizedImagesTemp.push({
          filename,
          blob,
          filesizeBefore,
          filesizeAfter: blobSize,
          widthAfter: canvasWidth,
          heightAfter: canvasHeight,
          widthBefore: img.width,
          heightBefore: img.height,
          isUpscaled,
        });
      } catch (e) {
        const msg = `Error loading "${imageFile.name}"`;
        setErrors([...errors, msg]);
        continue;
      }
    }

    // Stop the timer and calculate the processing time
    const endTime = performance.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(2); // in seconds, rounded to two decimal places
    setProcessingTime(processingTime);

    setResizedImages(resizedImagesTemp);

    setIsProcessing(false);
  }, [images, boundingBox, compressionLevel, disableUpscale]); // eslint-disable-line react-hooks/exhaustive-deps

  // perform resize when uploaded images are updated
  useEffect(() => {
    handleResize();
  }, [images, handleResize]);

  // enable/disable download button
  useEffect(() => {
    setAllowDownload(resizedImages.length > 0);
  }, [resizedImages]);

  const handleReset = () => {
    setAllowDownload(false);
    setImages([]);
    setResizedImages([]);
    setErrors([]);
  };

  // download all resized images as a ZIP file
  const downloadZip = async () => {
    setIsProcessing(true);
    const zip = new JSZip();

    // add all blobs to zip
    for (const { filename, blob } of resizedImages) {
      // if there is a suffix, append it to the filename
      let saveFilename = filename;
      if (enableSuffix) {
        const lastDotIndex = filename.lastIndexOf(".");
        const name = filename.substring(0, lastDotIndex);
        const ext = filename.substring(lastDotIndex + 1);
        saveFilename = `${name}${suffix}.${ext}`;
      }
      zip.file(saveFilename, blob);
    }

    try {
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "resized_images.zip");
    } catch (error) {
      console.error("Error creating ZIP:", error);
      setErrors([...errors, "Error creating ZIP file."]);
    } finally {
      setIsProcessing(false);
    }
  };

  const regenerate = () => {
    handleResize();
  };

  const isEmpty = images.length === 0;

  return (
    <div ref={dropRef} className="app">
      <div className="header">
        <h1>Batch Image Resizer</h1>
        <SizeSelect
          onChange={(sizeStr) => {
            const [width, height] = sizeStr
              .split("x")
              .map((s) => parseInt(s, 10));
            setBoundingBox({ width, height });
          }}
          width={boundingBox.width}
          height={boundingBox.height}
          disabled={isProcessing}
        />
        <CompressionSelect
          onChange={setCompressionLevel}
          value={compressionLevel}
          disabled={isProcessing}
        />

        {/* disable upscale */}
        <label>
          <input
            type="checkbox"
            checked={disableUpscale}
            onChange={() => setDisableUpscale(!disableUpscale)}
          />
          Disable Upscale
        </label>

        {/* enable suffix */}
        <label>
          <input
            type="checkbox"
            checked={enableSuffix}
            onChange={() => setEnableSuffix(!enableSuffix)}
          />
          Enable Suffix
        </label>

        {/* suffix */}
        <input
          type="text"
          value={suffix}
          onChange={(e) => setSuffix(e.target.value)}
          placeholder="Suffix"
          disabled={!enableSuffix}
          className="input-suffix"
        />

        {/* download as ZIP */}
        <button
          onClick={downloadZip}
          disabled={!allowDownload || isProcessing || isEmpty}
        >
          Download as ZIP
        </button>

        {/* reset button */}
        <button onClick={handleReset} disabled={isEmpty}>
          Reset
        </button>

        {/* File upload button */}
        <label className="file-upload-label">
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            multiple
            onChange={handleFileInputChange}
            disabled={isProcessing}
            style={{ display: "block" }}
          />
        </label>
      </div>

      <Errors errors={errors} />

      <OutputImages
        resizedImages={resizedImages}
        suffix={suffix}
        enableSuffix={enableSuffix}
        loading={isProcessing}
      />

      {processingTime >= 0.01 && (
        <p>Processing time: {processingTime} seconds</p>
      )}
      <div className="footer">
        <p>
          All images are resized on the client side using the HTML5 Canvas API,
          within the web browser. Images are never uploaded to any third party
          server.{" "}
          <a href="https://github.com/andygock/batch-image-resizer/">GitHub</a>
        </p>
      </div>
    </div>
  );
}

export default App;
