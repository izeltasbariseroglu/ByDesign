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

        // Clear any prev content (safe to call multiple times)
        this.photosContainer.innerHTML = '';

        // Build a labeled "evidence frame" for each photo
        const makeFrame = (src, label, timestamp, borderColor) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            `;

            const labelEl = document.createElement('div');
            labelEl.style.cssText = `
                font-size: 0.55rem;
                color: ${borderColor};
                letter-spacing: 4px;
                text-transform: uppercase;
                font-family: 'Courier New', monospace;
            `;
            labelEl.innerText = label;
            wrapper.appendChild(labelEl);

            const frame = document.createElement('div');
            frame.style.cssText = `
                position: relative;
                width: 300px;
                height: 225px;
                border: 2px solid ${borderColor};
                box-shadow: 0 0 20px ${borderColor}55, inset 0 0 20px rgba(0,0,0,0.8);
                overflow: hidden;
            `;

            if (src) {
                const img = document.createElement('img');
                img.src = src;
                img.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    filter: grayscale(90%) contrast(1.2) brightness(0.85);
                    display: block;
                `;
                frame.appendChild(img);
            } else {
                frame.style.background = '#0a0000';
                frame.style.display = 'flex';
                frame.style.alignItems = 'center';
                frame.style.justifyContent = 'center';
                const noData = document.createElement('div');
                noData.style.cssText = 'font-size:0.55rem; color:#330000; text-align:center; letter-spacing:2px;';
                noData.innerText = '[KAYIT YOK]';
                frame.appendChild(noData);
            }

            // Timestamp overlay
            const ts = document.createElement('div');
            ts.style.cssText = `
                position: absolute;
                bottom: 6px; left: 8px;
                font-size: 0.5rem;
                color: ${borderColor}99;
                font-family: 'Courier New', monospace;
                letter-spacing: 1px;
                pointer-events: none;
            `;
            ts.innerText = timestamp;
            frame.appendChild(ts);

            // Scanline overlay
            const scan = document.createElement('div');
            scan.style.cssText = `
                position: absolute;
                inset: 0;
                background: repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(0,0,0,0.15) 2px,
                    rgba(0,0,0,0.15) 4px
                );
                pointer-events: none;
            `;
            frame.appendChild(scan);

            wrapper.appendChild(frame);

            const tsBottom = document.createElement('div');
            tsBottom.style.cssText = `
                font-size: 0.5rem;
                color: #333;
                letter-spacing: 2px;
                font-family: 'Courier New', monospace;
            `;
            tsBottom.innerText = timestamp;
            wrapper.appendChild(tsBottom);

            return wrapper;
        };

        // Photo 1: Game start — secretly captured
        this.photosContainer.appendChild(
            makeFrame(initialPhoto, '[ BAŞLANGIC — GİZLİCE ÇEKİLDİ ]', 't = 00:00:00', '#555555')
        );

        // Separator — "VS" divider
        const sep = document.createElement('div');
        sep.style.cssText = `
            display: flex;
            align-items: center;
            font-size: 1.2rem;
            color: #333;
            letter-spacing: 6px;
            align-self: center;
        `;
        sep.innerText = '►';
        this.photosContainer.appendChild(sep);

        // Photo 2: Collapse moment
        this.photosContainer.appendChild(
            makeFrame(finalPhoto, '[ ÇÖKÜŞ ANI — 150. SANİYE ]', 't = 00:02:30', '#cc0000')
        );

        // Hard cut — no fade
        this.container.style.display = 'flex';

        // Final message
        this.textLabel.innerHTML =
            `<span style="color:#888; font-size:0.7rem; letter-spacing:6px;">BYDESIGN/SESSION_ID:${Date.now()}</span>` +
            `<br><br>` +
            `<span style="color:#fff; font-size:1.4rem; letter-spacing:5px;">Aslında başından beri bir çıkış yoktu.</span>`;

        // Release pointer lock
        if (document.pointerLockElement) document.exitPointerLock();

        console.warn('ByDesign: END SCREEN shown. Session locked. No restart.');
    }
}
