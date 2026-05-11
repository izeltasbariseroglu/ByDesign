export class EndScreen {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'end-screen';
        this.container.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: #000;
            z-index: 9999;
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: #fff;
            font-family: 'Courier New', monospace;
            text-transform: uppercase;
            letter-spacing: 3px;
            user-select: none;
            pointer-events: all;
        `;

        this.photosContainer = document.createElement('div');
        this.photosContainer.style.cssText = `
            display: flex;
            gap: 30px;
            margin-bottom: 50px;
            filter: grayscale(100%) contrast(1.3) brightness(0.9);
        `;
        this.container.appendChild(this.photosContainer);

        this.textLabel = document.createElement('div');
        this.textLabel.style.cssText = `
            font-size: 1.5rem;
            text-align: center;
            line-height: 2;
            color: #ccc;
            letter-spacing: 4px;
            text-shadow: 0 0 10px rgba(255,255,255,0.3);
        `;
        this.container.appendChild(this.textLabel);

        // Prevent any key presses or interaction from escaping
        this.container.addEventListener('click', e => e.stopPropagation());
        window.addEventListener('keydown', e => {
            if (document.getElementById('end-screen')?.style.display !== 'none') {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);

        document.body.appendChild(this.container);
        console.log("EndScreen initialized (Phase 3, locked)");
    }

    show(initialPhoto, finalPhoto) {
        // Hide HUD
        const hud = document.getElementById('hud-container');
        if (hud) { hud.style.display = 'none'; hud.innerHTML = ''; }

        // Hide old photo system (removed per revision)
        this.photosContainer.style.display = 'none';

        // Hard cut to black
        this.container.style.display = 'flex';

        // Release pointer lock
        if (document.pointerLockElement) document.exitPointerLock();

        const sentences = [
            { text: "It wasn't a game.", duration: 4000 },
            { text: "You were just a toy.", duration: 4000 },
            { text: "There is no escape.", duration: 4000 }
        ];

        let index = 0;

        this.textLabel.style.transition = 'opacity 0.5s ease';
        this.textLabel.style.opacity = '0';
        this.textLabel.style.fontSize = '2.5rem';
        this.textLabel.style.color = '#ffffff';

        const showNext = () => {
            if (index >= sentences.length) {
                console.warn('ByDesign: End sequence complete. Reloading page...');
                setTimeout(() => location.reload(), 500);
                return;
            }

            const current = sentences[index];
            this.textLabel.innerText = current.text;
            this.textLabel.style.opacity = '1';

            setTimeout(() => {
                this.textLabel.style.opacity = '0';
                setTimeout(() => {
                    index++;
                    showNext();
                }, 500);
            }, current.duration - 500);
        };

        // Start the sequence after a brief pause
        setTimeout(showNext, 1000);
    }
}
