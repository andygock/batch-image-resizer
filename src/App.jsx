import { useState, useRef, useEffect, useCallback } from "react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import "./App.css";

function App() {
  const [images, setImages] = useState([]);
  const [resizedImages, setResizedImages] = useState([]);
  const [errors, setErrors] = useState([]);
  const [boundingBox, setBoundingBox] = useState({ width: 512, height: 512 });
  const [compressionLevel, setCompressionLevel] = useState(0.8); // Default compression level
  const [allowDownload, setAllowDownload] = useState(false);

  const dropRef = useRef(null);

  // drag and drop handling
  useEffect(() => {
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropRef.current.style.backgroundColor = "lightblue";
    };

    const handleDragLeave = () => {
      dropRef.current.style.backgroundColor = "white";
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropRef.current.style.backgroundColor = "white";

      let newImages = Array.from(e.dataTransfer.files);
      handleImageUpload(newImages);
    };

    dropRef.current.addEventListener("dragover", handleDragOver);
    dropRef.current.addEventListener("dragleave", handleDragLeave);
    dropRef.current.addEventListener("drop", handleDrop);

    return () => {
      dropRef.current.removeEventListener("dragover", handleDragOver);
      dropRef.current.removeEventListener("dragleave", handleDragLeave);
      dropRef.current.removeEventListener("drop", handleDrop);
    };
  }, []);

  const handleImageUpload = (files) => {
    const newErrors = [];
    const newImages = [];

    for (const file of files) {
      if (!file.type.startsWith("image/jpeg")) {
        newErrors.push(`File ${file.name} is not a JPEG image.`);
        continue;
      }

      // (Checksum implementation for duplicate check is omitted for brevity,
      // but would involve reading file blobs and comparing hashes)
      // TODO: Check for duplicate images

      newImages.push(file);
    }

    setErrors([...errors, ...newErrors]);
    setImages([...images, ...newImages]);
  };

  const handleResize = useCallback(async () => {
    const resizedImagesTemp = [];

    for (const imageFile of images) {
      try {
        const img = await createImageBitmap(imageFile);

        // Calculate the aspect ratio of the image
        const imgAspectRatio = img.width / img.height;

        // Calculate the aspect ratio of the bounding box
        const boundingBoxAspectRatio = boundingBox.width / boundingBox.height;

        let canvasWidth, canvasHeight;

        // If the image's aspect ratio is greater than the bounding box's aspect ratio
        // then the image's width will be the limiting factor
        if (imgAspectRatio > boundingBoxAspectRatio) {
          canvasWidth = Math.min(boundingBox.width, img.width);
          canvasHeight = Math.min(
            boundingBox.width / imgAspectRatio,
            img.height
          );
        } else {
          // Otherwise, the image's height will be the limiting factor
          canvasHeight = Math.min(boundingBox.height, img.height);
          canvasWidth = Math.min(
            boundingBox.height * imgAspectRatio,
            img.width
          );
        }

        // canvas width and height need to be floored to integers
        canvasWidth = Math.floor(canvasWidth);
        canvasHeight = Math.floor(canvasHeight);

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
          size: blobSize,
          width: canvasWidth,
          height: canvasHeight,
        });
      } catch (error) {
        console.error("Error resizing image:", error);
        setErrors([...errors, `Error resizing ${imageFile.name}`]);
      }
    }

    setResizedImages(resizedImagesTemp);
  }, [images, boundingBox, compressionLevel, errors]);

  // perform resize when uploaded images are updated
  useEffect(() => {
    handleResize();
  }, [images, handleResize]);

  // enable/disable download button
  useEffect(() => {
    setAllowDownload(resizedImages.length > 0);
  }, [resizedImages]);

  // download all resized images as a ZIP file
  const downloadZip = () => {
    const zip = new JSZip();

    // add all blobs to zip
    for (const { filename, blob } of resizedImages) {
      zip.file(filename, blob);
    }

    zip
      .generateAsync({ type: "blob" })
      .then((blob) => {
        saveAs(blob, "resized_images.zip");
      })
      .catch((error) => {
        console.error("Error creating ZIP:", error);
        setErrors([...errors, "Error creating ZIP file."]);
      });
  };

  const regenerate = () => {
    handleResize();
  };

  const handleReset = () => {
    setAllowDownload(false);
    setImages([]);
    setResizedImages([]);
    setErrors([]);
  };

  return (
    <div ref={dropRef} style={{ border: "2px dashed gray", padding: "20px" }}>
      <h1>Batch Image Resizer</h1>
      <input
        type="number"
        value={boundingBox.width}
        onChange={(e) =>
          setBoundingBox({
            ...boundingBox,
            width: parseInt(e.target.value, 10) || 1024,
          })
        }
      />
      x
      <input
        type="number"
        value={boundingBox.height}
        onChange={(e) =>
          setBoundingBox({
            ...boundingBox,
            height: parseInt(e.target.value, 10) || 1024,
          })
        }
      />
      <label htmlFor="compression">JPEG Compression:</label>
      <input
        type="range"
        id="compression"
        min="0"
        max="1"
        step="0.1"
        value={compressionLevel}
        onChange={(e) => setCompressionLevel(parseFloat(e.target.value))}
      />
      <span>{compressionLevel}</span>
      <div>
        <button onClick={regenerate} disabled={!allowDownload}>
          Regenerate
        </button>
        <button onClick={downloadZip} disabled={!allowDownload}>
          Download as ZIP
        </button>
        <button onClick={handleReset}>Reset</button>
        {errors.length > 0 && (
          <div>
            <h2>Errors:</h2>
            <ul>
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
        }}
      >
        {resizedImages.map(
          ({ filename, blob: image, size, width, height }, index) => {
            const url = URL.createObjectURL(image);
            return (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  margin: "3px",
                }}
              >
                <a href={url} download={filename}>
                  <div>
                    <img
                      src={url}
                      alt={filename}
                      width={width}
                      height={height}
                    />
                  </div>
                </a>
                <div>{filename}</div>
                <div>{Math.round(size / 1024)} kB</div>
                <div>
                  {width}x{height} px
                </div>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

export default App;
