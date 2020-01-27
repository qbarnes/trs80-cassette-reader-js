import {DisplaySamples} from "./DisplaySamples";
import {BitType} from "./BitType";
import {BitData} from "./BitData";
import {Program} from "./Program";
import {Highlight} from "./Highlight";

/**
 * An individual waveform to be displayed.
 */
class Waveform {
    public readonly canvas: HTMLCanvasElement;
    public samples: DisplaySamples | undefined;

    constructor(canvas: HTMLCanvasElement, samples?: DisplaySamples) {
        this.canvas = canvas;
        this.samples = samples;
    }
}

/**
 * Displays a list of different waveforms, synchronizing their pan and zoom.
 */
export class WaveformDisplay {
    /**
     * The width of the canvases, in pixels.
     */
    private displayWidth: number = 0;
    /**
     * The zoom level, where 0 means all the way zoomed in and each original
     * audio sample maps to one column of pixels on the screen; 1 means
     * zoomed out from that by a factor of two, etc.
     */
    private zoom: number = 0; // Initialized in zoomToFitAll()
    /**
     * The max value that zoom can have.
     */
    private maxZoom: number = 0;
    /**
     * The sample in the middle of the display, in original samples.
     */
    private centerSample: number = 0; // Initialized in zoomToFitAll()
    /**
     * All the waveforms we're displaying, and their canvases.
     */
    private waveforms: Waveform[] = [];
    /**
     * All the programs represented on these waveforms.
     */
    private programs: Program[] = [];
    /**
     * Start of current highlight, if any, in original samples, inclusive.
     */
    private startHighlightFrame: number | undefined;
    /**
     * End of current highlight, if any, in original samples, inclusive.
     */
    private endHighlightFrame: number | undefined;
    /**
     * Listeners of the maxZoom property.
     */
    private onMaxZoom: ((maxZoom: number) => void)[] = [];
    /**
     * Listeners of the zoom property.
     */
    private onZoom: ((zoom: number) => void)[] = [];

    /**
     * Add a waveform to display.
     */
    public addWaveform(canvas: HTMLCanvasElement, samples: DisplaySamples) {
        const displayWidth = canvas.width;
        if (this.displayWidth === 0) {
            this.displayWidth = displayWidth;
        } else if (this.displayWidth !== displayWidth) {
            throw new Error("Widths of the canvases must match");
        }

        // Compute max display level.
        let newMaxZoom = samples.samplesList.length - 1;
        if (newMaxZoom !== this.maxZoom) {
            this.maxZoom = newMaxZoom;
            this.onMaxZoom.forEach(callback => callback(newMaxZoom));
        }

        this.waveforms.push(new Waveform(canvas, samples));
        this.configureCanvas(canvas);
    }

    /**
     * Add a program to highlight in the waveform.
     */
    public addProgram(program: Program) {
        this.programs.push(program);
    }

    /**
     * Update the current highlight.
     */
    public setHighlight(highlight: Highlight | undefined): void {
        this.startHighlightFrame = undefined;
        this.endHighlightFrame = undefined;

        if (highlight !== undefined) {
            const byteData = highlight.program.byteData[highlight.firstIndex];
            if (byteData !== undefined) {
                this.startHighlightFrame = byteData.startFrame;
                this.endHighlightFrame = byteData.endFrame;
            }
        }

        this.draw();
    }

    /**
     * Update the current highlight.
     */
    public setSelection(selection: Highlight | undefined): void {
        // TODO.
    }

    /**
     * Create zoom control elements, bind them to this waveform display, and return them.
     * These are not guaranteed to be a block element. Caller should warp them in
     * a div if that's what they want.
     */
    public makeZoomControls(): HTMLElement {
        const label = document.createElement("label") as HTMLLabelElement;
        label.innerText = "Zoom: ";

        const input = document.createElement("input") as HTMLInputElement;
        input.type = "range";
        label.appendChild(input);

        // We want to flip this horizontally, so make the slider's value
        // the negative of the real zoom.
        input.min = (-this.maxZoom).toString();
        input.max = "0";
        this.onMaxZoom.push(maxZoom => input.min = (-maxZoom).toString());
        this.onZoom.push(zoom => input.value = (-zoom).toString());

        input.addEventListener("input", () => {
            this.setZoom(-parseInt(input.value));
        });

        return label;
    }

    /**
     * Configure the mouse events in the canvas.
     */
    private configureCanvas(canvas: HTMLCanvasElement) {
        let dragging = false;
        let dragInitialX = 0;
        let dragInitialCenterSample = 0;

        canvas.addEventListener("mousedown", event => {
            dragging = true;
            dragInitialX = event.x;
            dragInitialCenterSample = this.centerSample;
            canvas.style.cursor = "grab";
        });

        window.addEventListener("mouseup", () => {
            if (dragging) {
                dragging = false;
                canvas.style.cursor = "auto";
            }
        });

        canvas.addEventListener("mousemove", event => {
            if (dragging) {
                const dx = event.x - dragInitialX;
                const mag = Math.pow(2, this.zoom);
                this.centerSample = Math.round(dragInitialCenterSample - dx * mag);
                this.draw();
            }
        });
    }

    /**
     * Draw all the waveforms.
     */
    public draw() {
        for (const waveform of this.waveforms) {
            this.drawInCanvas(waveform.canvas, waveform.samples);
        }
    }

    /**
     * Compute fit level to fit the specified number of samples.
     *
     * @param sampleCount number of samples we want to display.
     */
    private computeFitLevel(sampleCount: number): number {
        let zoom = Math.ceil(Math.log2(sampleCount / this.displayWidth));
        zoom = Math.max(zoom, 0);
        zoom = Math.min(zoom, sampleCount - 1);
        return zoom;
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {DisplaySamples} displaySamples
     */
    private drawInCanvas(canvas: HTMLCanvasElement, displaySamples?: DisplaySamples) {
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        const width = canvas.width;
        const height = canvas.height;

        // Background.
        ctx.fillStyle = "rgb(0, 0, 0)";
        ctx.fillRect(0, 0, width, height);

        if (displaySamples === undefined) {
            return;
        }

        const samplesList = displaySamples.samplesList;
        const samples = samplesList[this.zoom];
        const mag = Math.pow(2, this.zoom);
        const centerSample = Math.floor(this.centerSample / mag);

        const frameToX = (i: number) => Math.floor(width / 2) + (i - centerSample);

        // Compute viewing window in zoom space.
        const firstSample = Math.max(centerSample - Math.floor(width / 2), 0);
        const lastSample = Math.min(centerSample + width - 1, samples.length - 1);

        // Compute viewing window in original space.
        const firstOrigSample = Math.floor(firstSample * mag);
        const lastOrigSample = Math.ceil(lastSample * mag);

        // Whether we're zoomed in enough to draw and line and individual bits.
        const drawingLine: boolean = this.zoom < 3;

        // Programs.
        for (const program of this.programs) {
            if (drawingLine) {
                for (const bitInfo of program.bitData) {
                    if (bitInfo.endFrame >= firstOrigSample && bitInfo.startFrame <= lastOrigSample) {
                        const x1 = frameToX(bitInfo.startFrame / mag);
                        const x2 = frameToX(bitInfo.endFrame / mag);
                        // console.log(bitInfo, x1, x2);
                        switch (bitInfo.bitType) {
                            case BitType.ZERO:
                                ctx.fillStyle = "rgb(50, 50, 50)";
                                break;
                            case BitType.ONE:
                                ctx.fillStyle = "rgb(100, 100, 100)";
                                break;
                            case BitType.START:
                                ctx.fillStyle = "rgb(20, 150, 20)";
                                break;
                            case BitType.BAD:
                                ctx.fillStyle = "rgb(150, 20, 20)";
                                break;
                        }
                        ctx.fillRect(x1, 0, x2 - x1 - 1, height);
                    }
                }
            } else {
                // Disable highlighting of programs, it's not very useful and interferes
                // with byte highlighting.
                // ctx.fillStyle = "rgb(50, 50, 50)";
                // const x1 = frameToX(program.startFrame / mag);
                // const x2 = frameToX(program.endFrame / mag);
                // ctx.fillRect(x1, 0, x2 - x1, height);
            }
        }

        // Highlight.
        if (this.startHighlightFrame !== undefined && this.endHighlightFrame !== undefined) {
            ctx.fillStyle = "rgb(150, 150, 150)";
            const x1 = frameToX(this.startHighlightFrame/ mag);
            const x2 = frameToX(this.endHighlightFrame / mag);
            ctx.fillRect(x1, 0, Math.max(x2 - x1, 1), height);
        }

        // Draw waveform.
        ctx.strokeStyle = "rgb(255, 255, 255)";
        if (drawingLine) {
            ctx.beginPath();
        }
        for (let i = firstSample; i <= lastSample; i++) {
            const value = samples[i];
            const x = frameToX(i);
            const y = value * height / 2;

            if (drawingLine) {
                if (i === firstSample) {
                    ctx.moveTo(x, height / 2 - y);
                } else {
                    ctx.lineTo(x, height / 2 - y);
                }
            } else {
                ctx.beginPath();
                ctx.moveTo(x, height / 2 - y);
                ctx.lineTo(x, height / 2 + y);
                ctx.stroke();
            }
        }
        if (drawingLine) {
            ctx.stroke();
        }
    }

    /**
     * Set the zoom level to a particular value.
     */
    public setZoom(zoom: number): void {
        const newZoom = Math.min(Math.max(0, zoom), this.maxZoom);
        if (newZoom !== this.zoom) {
            this.zoom = newZoom;
            this.onZoom.forEach(callback => callback(newZoom));
            this.draw();
        }
    }

    /**
     * Zoom in one level.
     */
    public zoomIn() {
        this.setZoom(this.zoom - 1);
    }

    /**
     * Zoom out one level.
     */
    public zoomOut() {
        this.setZoom(this.zoom + 1);
    }

    /**
     * Zoom to fit a particular bit.
     */
    public zoomToBitData(bitData: BitData) {
        // Show a bit after a many bits before.
        const startFrame = bitData.startFrame - 1500;
        const endFrame = bitData.endFrame + 300;

        this.zoomToFit(startFrame, endFrame);
    }

    /**
     * Zoom to fit a range of samples.
     */
    public zoomToFit(startFrame: number, endFrame: number) {
        const sampleCount = endFrame - startFrame;

        // Visually centered sample (in level 0).
        this.centerSample = Math.floor((startFrame + endFrame)/2);

        // Find appropriate zoom.
        this.setZoom(this.computeFitLevel(sampleCount));

        this.draw();
    }

    /**
     * Zoom to fit all samples.
     */
    public zoomToFitAll() {
        if (this.waveforms.length > 0 && this.waveforms[0].samples !== undefined) {
            this.zoomToFit(0, this.waveforms[0].samples.samplesList[0].length);
        }
    }
}


