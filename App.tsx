import React, { useState, useRef, useEffect } from 'react';
import { UploadIcon, SparklesIcon, RefreshIcon, DownloadIcon, ShareIcon, InstallIcon, ShareIosIcon, PlusSquareIcon } from './components/icons';

type Status = 'idle' | 'editing' | 'done';

// A type for the BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const dataURLtoFile = (dataurl: string, filename: string): File | null => {
    const arr = dataurl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

const getDistance = (p1: React.PointerEvent, p2: React.PointerEvent) => {
    return Math.sqrt(Math.pow(p2.clientX - p1.clientX, 2) + Math.pow(p2.clientY - p1.clientY, 2));
}

export default function App() {
  const [sourceImages, setSourceImages] = useState<string[]>([]);
  const [croppedImages, setCroppedImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [canShare, setCanShare] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstallPrompt, setShowIosInstallPrompt] = useState(false);
  const [isIosInstallModalOpen, setIsIosInstallModalOpen] = useState(false);

  // Editing state
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [dragStart, setDragStart] = useState({ pointerX: 0, pointerY: 0, imageX: 0, imageY: 0 });
  const [baseZoom, setBaseZoom] = useState(1);
  
  const cropBoxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageDimensionsRef = useRef({ width: 0, height: 0 });

  // Gesture refs
  const pointersRef = useRef<React.PointerEvent[]>([]);
  const startZoomRef = useRef(1);
  const initialPinchDistRef = useRef(0);

  const currentSourceImage = status === 'editing' ? sourceImages[currentIndex] : null;

  useEffect(() => {
    if (navigator.share) {
      setCanShare(true);
    }
     
    // Detect iOS
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    // Detect if the app is launched from the home screen
    const isStandalone = ('standalone' in window.navigator) && (window.navigator.standalone);
    
    if (isIos && !isStandalone) {
      setShowIosInstallPrompt(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (status === 'editing' && currentSourceImage && cropBoxRef.current) {
        setHasInteracted(false);
        const img = new Image();
        img.src = currentSourceImage;
        img.onload = () => {
            const { naturalWidth, naturalHeight } = img;
            imageDimensionsRef.current = { width: naturalWidth, height: naturalHeight };
            if (!cropBoxRef.current) return;
            const { width: boxWidth, height: boxHeight } = cropBoxRef.current.getBoundingClientRect();
            
            const displayedImgHeight = naturalHeight * (boxWidth / naturalWidth);
            
            const requiredZoomForHeight = boxHeight / displayedImgHeight;
            const initialZoom = Math.max(1, requiredZoomForHeight);

            setBaseZoom(initialZoom);
            setZoom(initialZoom);

            const scaledWidth = boxWidth * initialZoom;
            const scaledHeight = displayedImgHeight * initialZoom;

            const initialX = (boxWidth - scaledWidth) / 2;
            const initialY = (boxHeight - scaledHeight) / 2;
            
            setPosition({ x: initialX, y: initialY });
        }
    }
  }, [status, currentSourceImage]);

  const getClampedPosition = (pos: {x: number, y: number}, currentZoom: number): {x: number, y: number} => {
    if (!cropBoxRef.current || !imageDimensionsRef.current.width) {
        return pos;
    }
    const { width: boxWidth, height: boxHeight } = cropBoxRef.current.getBoundingClientRect();
    const { width: naturalWidth, height: naturalHeight } = imageDimensionsRef.current;
    
    if (naturalWidth === 0) return pos;

    const displayedImgHeight = naturalHeight * (boxWidth / naturalWidth);

    const scaledWidth = boxWidth * currentZoom;
    const scaledHeight = displayedImgHeight * currentZoom;
    
    const minX = boxWidth - scaledWidth;
    const maxX = 0;
    const minY = boxHeight - scaledHeight;
    const maxY = 0;

    return {
        x: scaledWidth >= boxWidth ? Math.max(minX, Math.min(pos.x, maxX)) : (boxWidth - scaledWidth) / 2,
        y: scaledHeight >= boxHeight ? Math.max(minY, Math.min(pos.y, maxY)) : (boxHeight - scaledHeight) / 2,
    };
  }

  useEffect(() => {
    if (status !== 'editing') return;
    
    const clampedPos = getClampedPosition(position, zoom);

    if (clampedPos.x !== position.x || clampedPos.y !== position.y) {
      setPosition(clampedPos);
    }
  }, [zoom, status, position]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const imageUrls = await Promise.all(
      Array.from(files).map((file: File) => fileToDataUrl(file))
    );

    setSourceImages(imageUrls);
    setCroppedImages([]);
    setCurrentIndex(0);
    setStatus('editing');
  };

  const resetState = () => {
    setSourceImages([]);
    setCroppedImages([]);
    setCurrentIndex(0);
    setStatus('idle');
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setBaseZoom(1);
    setHasInteracted(false);
    imageDimensionsRef.current = { width: 0, height: 0 };
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    pointersRef.current.push(e);
    setIsInteracting(true);
    setHasInteracted(true);
    
    if (pointersRef.current.length === 1) { // Pan start
        setDragStart({
            pointerX: e.clientX,
            pointerY: e.clientY,
            imageX: position.x,
            imageY: position.y,
        });
    } else if (pointersRef.current.length === 2) { // Zoom start
        initialPinchDistRef.current = getDistance(pointersRef.current[0], pointersRef.current[1]);
        startZoomRef.current = zoom;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isInteracting || !cropBoxRef.current) return;
    
    const index = pointersRef.current.findIndex(p => p.pointerId === e.pointerId);
    if (index > -1) {
        pointersRef.current[index] = e;
    }

    if (pointersRef.current.length === 1) { // Panning
        const dx = e.clientX - dragStart.pointerX;
        const dy = e.clientY - dragStart.pointerY;
        const newPos = { 
            x: dragStart.imageX + dx,
            y: dragStart.imageY + dy 
        };
        setPosition(getClampedPosition(newPos, zoom));
    } else if (pointersRef.current.length === 2) { // Zooming
        const currentDist = getDistance(pointersRef.current[0], pointersRef.current[1]);
        const newZoom = startZoomRef.current * (currentDist / initialPinchDistRef.current);
        setZoom(Math.max(baseZoom, Math.min(newZoom, baseZoom * 5)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
      pointersRef.current = pointersRef.current.filter(p => p.pointerId !== e.pointerId);
      if (pointersRef.current.length < 2) {
          initialPinchDistRef.current = 0;
      }
      if (pointersRef.current.length === 0) {
          setIsInteracting(false);
      }
  };

  const handleCropAndNext = async () => {
    if (!currentSourceImage || !cropBoxRef.current) return;
    
    const originalImage = new Image();
    originalImage.crossOrigin = 'anonymous';
    originalImage.src = currentSourceImage;
    await new Promise(resolve => { originalImage.onload = resolve });

    const { naturalWidth, naturalHeight } = originalImage;
    
    const canvas = document.createElement('canvas');
    const outputWidth = 900;
    const outputHeight = 1200;
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let sx_float: number, sy_float: number, sWidth_float: number, sHeight_float: number;

    if (hasInteracted) {
        const { width: cropBoxWidth, height: cropBoxHeight } = cropBoxRef.current.getBoundingClientRect();
        const finalScale = naturalWidth / (cropBoxWidth * zoom);
        
        sx_float = -position.x * finalScale;
        sy_float = -position.y * finalScale;
        sWidth_float = cropBoxWidth * finalScale;
        sHeight_float = cropBoxHeight * finalScale;
    } else {
        const imageAspectRatio = naturalWidth / naturalHeight;
        const targetAspectRatio = outputWidth / outputHeight;

        if (imageAspectRatio > targetAspectRatio) {
            sHeight_float = naturalHeight;
            sWidth_float = naturalHeight * targetAspectRatio;
            sx_float = (naturalWidth - sWidth_float) / 2;
            sy_float = 0;
        } else {
            sWidth_float = naturalWidth;
            sHeight_float = naturalWidth / targetAspectRatio;
            sx_float = 0;
            sy_float = (naturalHeight - sHeight_float) / 2;
        }
    }

    let finalSx = Math.ceil(sx_float);
    let finalSy = Math.ceil(sy_float);
    const endX_float = sx_float + sWidth_float;
    const endY_float = sy_float + sHeight_float;
    const finalEndX = Math.floor(endX_float);
    const finalEndY = Math.floor(endY_float);
    let finalSWidth = finalEndX - finalSx;
    let finalSHeight = finalEndY - finalSy;

    if (finalSx < 0) finalSx = 0;
    if (finalSy < 0) finalSy = 0;
    if (finalSWidth <= 0) finalSWidth = 1; 
    if (finalSHeight <= 0) finalSHeight = 1;
    if (finalSx + finalSWidth > naturalWidth) {
        finalSWidth = naturalWidth - finalSx;
    }
    if (finalSy + finalSHeight > naturalHeight) {
        finalSHeight = naturalHeight - finalSy;
    }
    
    ctx.drawImage(
        originalImage, 
        finalSx, finalSy, finalSWidth, finalSHeight, 
        0, 0, outputWidth, outputHeight
    );
    
    const dataUrl = canvas.toDataURL('image/png');
    setCroppedImages(prev => [...prev, dataUrl]);

    if (currentIndex < sourceImages.length - 1) {
        setCurrentIndex(prev => prev + 1);
    } else {
        setStatus('done');
    }
  };

  const handleShare = async () => {
    const files = croppedImages
      .map((dataUrl, index) => dataURLtoFile(dataUrl, `cropped-image-${index + 1}.png`))
      .filter((file): file is File => file !== null);

    if (files.length > 0 && navigator.share && navigator.canShare({ files })) {
      try {
        await navigator.share({
          files: files,
          title: 'Cropped Images',
          text: `Here are ${files.length} cropped image(s).`,
        });
      } catch (error) {
        console.error('Sharing failed:', error);
      }
    } else {
      alert('Sharing is not supported on this browser.');
    }
  };

  const handleDownloadAll = () => {
    croppedImages.forEach((dataUrl, index) => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `cropped-image-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };
  
  const handleInstallClick = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      setInstallPrompt(null);
    } else if (showIosInstallPrompt) {
      setIsIosInstallModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col font-sans text-white">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 p-4">
        <header className="relative py-4 text-center border-b border-gray-700 flex-shrink-0">
          <h1 className="text-xl font-bold flex items-center justify-center gap-2">
            <SparklesIcon className="w-6 h-6 text-purple-400" />
            Image Cropper
          </h1>
          <p className="text-xs text-gray-400 mt-1">Crop your image to a 3:4 aspect ratio</p>
          {(installPrompt || showIosInstallPrompt) && (
            <button
              onClick={handleInstallClick}
              className="absolute top-1/2 right-0 -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors"
              aria-label="Install app"
              title="Install app"
            >
              <InstallIcon className="w-6 h-6" />
            </button>
          )}
        </header>

        <main className="flex-1 flex flex-col items-center justify-center pt-6 text-center overflow-y-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/png, image/jpeg, image/webp"
            aria-hidden="true"
            multiple
          />

          {status === 'idle' && (
            <div className="space-y-4 w-full flex flex-col items-center">
              <p className="text-gray-300">Upload one or more images to crop.</p>
              <button
                onClick={handleUploadClick}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <UploadIcon className="w-5 h-5" />
                Select Images
              </button>
            </div>
          )}

          {status === 'editing' && (
            <div className="w-full flex flex-col items-center gap-4">
              <p className="text-gray-400" role="status">
                Editing image {currentIndex + 1} of {sourceImages.length}
              </p>
              <div 
                ref={cropBoxRef} 
                className="relative w-3/4 aspect-[3/4] bg-gray-800 rounded-lg overflow-hidden touch-none border border-gray-700"
                aria-label="Image cropping area"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                {currentSourceImage && (
                  <img
                    src={currentSourceImage}
                    alt="Draggable and zoomable preview for cropping"
                    className="absolute top-0 left-0"
                    draggable="false"
                    onContextMenu={(e) => e.preventDefault()}
                    style={{
                      width: '100%',
                      height: 'auto',
                      transformOrigin: 'center',
                      transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                      cursor: isInteracting ? 'grabbing' : 'grab',
                      userSelect: 'none',
                    }}
                  />
                )}
              </div>
              <button
                onClick={handleCropAndNext}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                {currentIndex === sourceImages.length - 1 ? 'Crop & Finish' : 'Crop & Next'}
              </button>
            </div>
          )}

          {status === 'done' && croppedImages.length > 0 && (
             <div className="w-full flex flex-col items-center gap-4">
                <p className="text-lg text-green-400" role="status">
                  {croppedImages.length} {croppedImages.length > 1 ? 'images' : 'image'} cropped successfully!
                </p>
                <div className="grid grid-cols-3 gap-2 w-full max-h-96 overflow-y-auto">
                    {croppedImages.map((src, index) => (
                        <img key={index} src={src} alt={`Cropped image ${index + 1}`} className="rounded-md w-full aspect-[3/4] object-cover" />
                    ))}
                </div>
                <div className="w-full flex flex-col items-center gap-3 mt-4">
                    {canShare ? (
                        <button onClick={handleShare} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                            <ShareIcon className="w-5 h-5" />
                            Share
                        </button>
                    ) : (
                        <button onClick={handleDownloadAll} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                            <DownloadIcon className="w-5 h-5" />
                            Download All
                        </button>
                    )}
                    <button onClick={resetState} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <RefreshIcon className="w-5 h-5" />
                        Start Over
                    </button>
                </div>
             </div>
          )}
        </main>
      </div>

      {isIosInstallModalOpen && (
        <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => setIsIosInstallModalOpen(false)}
        >
          <div 
            className="bg-gray-800 rounded-lg p-6 max-w-sm w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4">Install App</h2>
            <p className="text-gray-300 mb-6">To install this app on your device, please follow these steps:</p>
            <ol className="text-left space-y-4">
              <li className="flex items-center gap-4">
                <span className="bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">1</span>
                <span>Tap the <ShareIosIcon className="w-5 h-5 inline-block mx-1"/> Share button in Safari.</span>
              </li>
              <li className="flex items-center gap-4">
                <span className="bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">2</span>
                <span>Scroll down and tap on <PlusSquareIcon className="w-5 h-5 inline-block mx-1"/> 'Add to Home Screen'.</span>
              </li>
            </ol>
            <button 
              onClick={() => setIsIosInstallModalOpen(false)}
              className="mt-8 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
