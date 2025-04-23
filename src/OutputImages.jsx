export default function OutputImages({
  resizedImages,
  suffix,
  enableSuffix,
  loading,
}) {
  // console.table(resizedImages);

  if (loading) {
    // display a spinner or some sort of loading indicator
    return (
      <div>
        <p>Processing images, please wait a moment...</p>
      </div>
    );
  }

  if (!resizedImages.length) {
    return (
      <div className="center pad-3rem">
        <p>
          Drag and drop JPG, PNG or WebP image(s) into this window to batch
          resize.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
      }}
    >
      {resizedImages.map(
        (
          {
            filename,
            blob: image,
            filesizeBefore,
            filesizeAfter,
            widthBefore,
            heightBefore,
            widthAfter,
            heightAfter,
          },
          index
        ) => {
          const url = URL.createObjectURL(image);

          const fileSizeIsLower = filesizeAfter < filesizeBefore;

          // file size after, as percentage of file size before, rounded to integer
          const fileSizePercent = Math.round(
            (filesizeAfter / filesizeBefore) * 100
          );

          // use suffix if needed
          let downloadFilename = enableSuffix
            ? `${filename.substring(
                0,
                filename.lastIndexOf(".")
              )}${suffix}${filename.substring(filename.lastIndexOf("."))}`
            : filename;

          // always use .jpg as extension, user input could have been .png, .webp, etc.
          downloadFilename = `${downloadFilename.substring(
            0,
            downloadFilename.lastIndexOf(".")
          )}.jpg`;

          return (
            <div key={index} className="output-images">
              <img
                src={url}
                alt={filename}
                width={widthAfter}
                height={heightAfter}
              />
              <div className="image-info">
                <div>{filename}</div>
                <div>
                  {Math.ceil(filesizeBefore / 1024)}&nbsp;⭢&nbsp;
                  {Math.ceil(filesizeAfter / 1024)} kB (
                  {fileSizeIsLower && <span className="green">🠫 </span>}
                  {!fileSizeIsLower && <span className="red">🠅 </span>}
                  {fileSizePercent}%)
                </div>
                <div>
                  {widthBefore}x{heightBefore}&nbsp;⭢&nbsp;{widthAfter}x
                  {heightAfter} px
                </div>
                <a
                  href={url}
                  download={downloadFilename}
                  title={`Click to download "${downloadFilename}"`}
                  className="download"
                >
                  Download {Math.ceil(filesizeAfter / 1024)} kB JPG
                </a>
              </div>
            </div>
          );
        }
      )}
    </div>
  );
}
