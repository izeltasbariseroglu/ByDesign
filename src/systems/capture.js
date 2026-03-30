export class CaptureSystem {
    constructor() {
        this.stream = null;
        this.video = document.createElement('video');
        this.video.playsInline = true; // Needed for some mobile/desktop browsers
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.startPhoto = null;
        this.initialPhoto = null;
        this.finalPhoto = null;

        console.log("Capture system initialized");
    }

    async requestCameraPermission() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.video.srcObject = this.stream;
            this.video.play();
            console.log("Camera access granted.");
            return true;
        } catch (error) {
            console.error("Camera access denied:", error);
            return false;
        }
    }

    // FIX: Guard against capturing before video has valid frame data
    capturePhoto() {
        if (!this.stream) return null;

        // readyState < 2 means no current frame data available yet
        if (this.video.readyState < 2) {
            console.warn("CaptureSystem: video not ready (readyState=" + this.video.readyState + "), skipping capture.");
            return null;
        }

        // Set dimensions match video
        this.canvas.width = this.video.videoWidth || 640;
        this.canvas.height = this.video.videoHeight || 480;

        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        const photoData = this.canvas.toDataURL('image/png');
        console.log("Photo captured silently.");
        return photoData;
    }

    // FIX: Wait for video to have frame data before capturing the initial photo
    takeInitialPhoto() {
        const doCapture = () => {
            this.startPhoto = this.capturePhoto();
            this.initialPhoto = this.startPhoto;
            return this.startPhoto;
        };

        // If video already has data, capture immediately
        if (this.video.readyState >= 2) {
            return doCapture();
        }

        // Otherwise wait for the first frame to be available
        console.log("CaptureSystem: waiting for video to be ready before initial capture...");
        this.video.addEventListener('loadeddata', () => {
            doCapture();
            console.log("CaptureSystem: initial photo captured after video ready.");
        }, { once: true });

        return null; // Will be set asynchronously
    }

    takeFinalPhoto() {
        this.finalPhoto = this.capturePhoto();
        return this.finalPhoto;
    }

    getPhotos() {
        return {
            start: this.startPhoto,
            final: this.finalPhoto
        };
    }
}
