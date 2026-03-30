export class EndScreen {
    constructor() {
        this.container = document.createElement('div');
        this.container.style.position = 'fixed';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100vw';
        this.container.style.height = '100vh';
        this.container.style.backgroundColor = '#000';
        this.container.style.zIndex = '1000';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.justifyContent = 'center';
        this.container.style.alignItems = 'center';
        this.container.style.color = '#fff';
        
        this.photosContainer = document.createElement('div');
        this.photosContainer.style.display = 'flex';
        this.photosContainer.style.gap = '20px';
        this.photosContainer.style.marginBottom = '40px';
        this.container.appendChild(this.photosContainer);
        
        this.textLabel = document.createElement('div');
        this.textLabel.style.fontSize = '2rem';
        this.textLabel.style.textAlign = 'center';
        this.textLabel.classList.add('glitch');
        this.container.appendChild(this.textLabel);
        
        console.log("EndScreen initialized");
    }

    show(initialPhoto, finalPhoto) {
        const hud = document.getElementById('hud-container');
        if (hud) {
            hud.style.display = 'none';
            hud.innerHTML = '';
        }
        
        const photoStyle = "width: 320px; border: 2px solid #333; filter: grayscale(100%) contrast(1.2);";
        
        if (initialPhoto) {
            const img1 = document.createElement('img');
            img1.src = initialPhoto;
            img1.style.cssText = photoStyle;
            this.photosContainer.appendChild(img1);
        }
        
        if (finalPhoto) {
            const img2 = document.createElement('img');
            img2.src = finalPhoto;
            img2.style.cssText = photoStyle;
            img2.classList.add('glitch');
            this.photosContainer.appendChild(img2);
        }
        
        document.body.appendChild(this.container);
        
        this.textLabel.innerText = "YOU THOUGHT YOU HAD CONTROL.";
        
        setTimeout(() => {
            this.textLabel.innerHTML += "<br><br>YOU NEVER DID.";
        }, 2000);
    }
}
