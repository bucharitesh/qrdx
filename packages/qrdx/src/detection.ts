import jsQR from "jsqr";

/**
 * Downloads the processed image data as a PNG file
 */
export const downloadImageData = (
  imageData: ImageData,
  width: number,
  height: number,
  filename: string
) => {
  // Create a temporary canvas to hold the image data
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;

  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) {
    return;
  }

  // Put the image data on the canvas
  tempCtx.putImageData(imageData, 0, 0);

  // Convert canvas to data URL
  const dataURL = tempCanvas.toDataURL("image/png");

  // Create download link
  const downloadLink = document.createElement("a");
  downloadLink.href = dataURL;
  downloadLink.download = filename;

  // Add to DOM, click and remove (invisible to user)
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
};

const decodeQRCode = (
  imgElement: HTMLImageElement,
  ratio: number,
  dx: number,
  dy: number
) => {
  return new Promise((resolve) => {
    // Ensure image is fully loaded
    if (imgElement.complete) {
      performDecode();
    } else {
      imgElement.onload = () => performDecode();
    }

    function performDecode() {
      const canvas = document.createElement("canvas");

      // Wait for a frame to ensure browser has completed image processing
      requestAnimationFrame(() => {
        // Ensure we have valid dimensions
        if (!(imgElement.naturalWidth && imgElement.naturalHeight)) {
          resolve(null);
          return;
        }

        const decreaseRatio =
          imgElement.naturalWidth / imgElement.naturalHeight <= 0.33 ||
          imgElement.naturalWidth / imgElement.naturalHeight >= 3
            ? Math.sqrt(
                (imgElement.naturalWidth * imgElement.naturalHeight) / 1_200_000
              )
            : imgElement.naturalWidth / imgElement.naturalHeight <= 0.5 ||
                imgElement.naturalWidth / imgElement.naturalHeight >= 2
              ? Math.sqrt(
                  (imgElement.naturalWidth * imgElement.naturalHeight) / 900_000
                )
              : Math.sqrt(
                  (imgElement.naturalWidth * imgElement.naturalHeight) / 640_000
                );

        const ctx = canvas.getContext("2d", {
          willReadFrequently: true,
        });

        if (!ctx) {
          resolve(null);
          return;
        }

        // Try multiple scale ratios: 1.0, 0.8, 0.6, 0.4, 0.2, 0.1
        const scaleRatios = [1.0, 0.8, 0.6, 0.4, 0.2, 0.1];

        for (const scaleRatio of scaleRatios) {
          const width = Math.floor(
            (imgElement.naturalWidth * ratio * scaleRatio) / decreaseRatio
          );
          const height = Math.floor(
            (imgElement.naturalHeight * ratio * scaleRatio) / decreaseRatio
          );

          // Set canvas dimensions
          canvas.width = width;
          canvas.height = height;

          // Clear canvas before drawing
          ctx.clearRect(0, 0, width, height);

          // Enable image smoothing for better quality
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          try {
            ctx.drawImage(
              imgElement,
              Math.floor(dx),
              Math.floor(dy),
              Math.floor(imgElement.naturalWidth * ratio),
              Math.floor(imgElement.naturalHeight * ratio),
              0,
              0,
              width,
              height
            );

            const imageData = ctx.getImageData(0, 0, width, height);

            downloadImageData(
              imageData,
              width,
              height,
              `qr_processed_${width}x${height}_scale${scaleRatio}_${Date.now()}.png`
            );

            // Add error handling for QR detection
            try {
              const qrCode = jsQR(imageData.data, width, height);
              if (qrCode?.data) {
                resolve(qrCode);
                return;
              }
            } catch (qrError) {
              console.error("QR Detection error:", qrError);
            }
          } catch (drawError) {
            console.error("Canvas drawing error:", drawError);
          }
          resolve(null);
        }

        // If no QR code found at any scale
        resolve(null);
      });
    }
  });
};

export const handleImageLoad = async (
  uploadedImage: HTMLImageElement,
  _size: number,
  returnFullData = false
) => {
  if (!uploadedImage) {
    return "NO_QR";
  }

  // Add a small delay to ensure image is fully processed
  await new Promise((resolve) => setTimeout(resolve, 100));

  const attempts = [
    { dx: 0, dy: 0, ratio: 1 },
    { dx: 0, dy: uploadedImage.naturalHeight * 0.35, ratio: 0.65 },
    {
      dx: uploadedImage.naturalWidth * 0.35,
      dy: uploadedImage.naturalHeight * 0.35,
      ratio: 0.65,
    },
    { dx: uploadedImage.naturalWidth * 0.35, dy: 0, ratio: 0.65 },
    {
      dx: (uploadedImage.naturalWidth * 0.35) / 2,
      dy: (uploadedImage.naturalHeight * 0.35) / 2,
      ratio: 0.65,
    },
  ];

  for (const attempt of attempts) {
    try {
      const embeddedQRData: any = await decodeQRCode(
        uploadedImage,
        attempt.ratio,
        attempt.dx,
        attempt.dy
      );

      if (embeddedQRData?.data) {
        return returnFullData ? embeddedQRData : embeddedQRData.data;
      }
    } catch (error) {
      console.warn("QR decode error:", error);
    }
  }

  return "NO_QR";
};

/**
 * Downloads the original image with a bounding box around the QR code
 */
export function downloadImageWithBoundingBox(
  imgElement: HTMLImageElement,
  boundingBox: { x: number; y: number }[],
  filename: string
) {
  if (!(imgElement && boundingBox) || boundingBox.length !== 4) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = imgElement.naturalWidth;
  canvas.height = imgElement.naturalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  // Draw the original image
  ctx.drawImage(imgElement, 0, 0);
  // Draw the bounding box with better visibility
  ctx.save();
  ctx.strokeStyle = "#ff0000"; // Red color for better visibility
  ctx.lineWidth = Math.max(
    5,
    Math.min(imgElement.naturalWidth, imgElement.naturalHeight) / 200
  );
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.moveTo(boundingBox[0].x, boundingBox[0].y); // topLeft
  ctx.lineTo(boundingBox[1].x, boundingBox[1].y); // topRight
  ctx.lineTo(boundingBox[3].x, boundingBox[3].y); // bottomRight
  ctx.lineTo(boundingBox[2].x, boundingBox[2].y); // bottomLeft
  ctx.closePath();
  ctx.stroke();

  // Add corner markers for debugging
  ctx.fillStyle = "#ff0000";
  boundingBox.forEach((point, index) => {
    ctx.fillRect(point.x - 3, point.y - 3, 6, 6);
    // Add labels for debugging
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.fillText(`${index}`, point.x + 5, point.y - 5);
    ctx.fillStyle = "#ff0000";
  });

  ctx.restore();
  const dataURL = canvas.toDataURL("image/png");
  const downloadLink = document.createElement("a");
  downloadLink.href = dataURL;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}
