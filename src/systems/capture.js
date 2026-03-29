export class CaptureSystem {
    constructor() {
        this.stream = null;
        this.video = document.createElement('video');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.startPhoto = null;
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

    capturePhoto() {
        if (!this.stream) return null;

        // Set dimensions match video
        this.canvas.width = this.video.videoWidth || 640;
        this.canvas.height = this.video.videoHeight || 480;

        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        const photoData = this.canvas.toDataURL('image/png');
        console.log("Photo captured silently.");
        return photoData;
    }

    takeInitialPhoto() {
        this.startPhoto = this.capturePhoto();
        return this.startPhoto;
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
