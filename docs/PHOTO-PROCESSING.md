# PHOTO PROCESSING — Sharp & FFmpeg Pipeline

> **Phase:** 0 Revision  
> **Status:** Architecture finalized. 

---

## 1. PROCESSING PIPELINE

When 3 original photos are successfully captured and saved to disk, the Web Server (`web/lib/processing/`) orchestrates the post-processing pipeline. 

All processing happens **locally on the laptop** to ensure offline capability.

### Sequence
1. **Thumbnail Generation** (Sharp) - For fast UI rendering
2. **Final Composite** (Sharp) - For printing and static download
3. **GIF Generation** (gifencoder / sharp-gif2) - For animated download
4. **MP4 Generation** (fluent-ffmpeg) - For animated download (social media friendly)

> **Important:** The GIF and MP4 are generated from the **individual original photos**, NOT the final composite template.

---

## 2. FINAL COMPOSITE (Sharp)

### Input
- 3 original photos (JPEG, e.g., 6000x4000 from DSLR)
- 1 template frame (PNG with transparency)
- `meta.json` defining slot coordinates and sizes

### Process
1. Load `frame.png` as base canvas.
2. For each slot defined in `meta.json`:
   - Load original photo `N`.
   - Resize and crop (`sharp().resize(width, height, { fit: 'cover' })`) to match slot dimensions.
3. Composite all processed photos BEHIND or INSIDE the transparent holes of the `frame.png`.
4. Output `final.jpg` (JPEG quality 90).

### Template Format (`meta.json`)
```json
{
  "id": "template-01",
  "name": "Classic Y2K",
  "output_size": { "width": 1200, "height": 1800 },
  "slots": [
    { "x": 100, "y": 200, "width": 1000, "height": 450 },
    { "x": 100, "y": 700, "width": 1000, "height": 450 },
    { "x": 100, "y": 1200, "width": 1000, "height": 450 }
  ]
}
```
*Note: Depending on design, slots can be stacked vertically (strip) or in a grid.*

---

## 3. GIF GENERATION

### Sequence
`[photo-1] → [photo-2] → [photo-3] → [photo-2] → [photo-1] → (LOOP)`

### Parameters
- **Dimensions**: 800px width (aspect ratio maintained).
- **Frame Delay**: 800ms per frame.
- **Library**: `gifencoder` or `sharp-gif2` (native Node.js, no external binaries required).

---

## 4. MP4 GENERATION

### Sequence
Same as GIF: `1 → 2 → 3 → 2 → 1`

### Parameters
- **Duration**: ~1.5 - 2 seconds per photo.
- **Transition**: Freeze-frame (cut) or smooth crossfade (TBD based on ffmpeg complexity vs performance).
- **Format**: H.264, CRF 28 (optimizing for file size over pristine quality to save bandwidth).
- **Dimensions**: Scaled to height=1080 or width=800.
- **Audio**: Silent (no background music defined yet).

### FFmpeg Command Example (conceptual)
```bash
ffmpeg -framerate 1/2 -i temp_sequence_%d.jpg -c:v libx264 -r 30 -pix_fmt yuv420p output.mp4
```
*(fluent-ffmpeg will wrap the execution).*

---

## 5. PERFORMANCE OPTIMIZATIONS

- **Memory Management**: Sharp processes images in streams/buffers. We must ensure garbage collection happens and we don't hold massive original JPEG buffers in memory longer than needed.
- **Asynchronous Execution**: GIF and MP4 generation run concurrently (`Promise.all`) after final.jpg is created, to reduce total processing time.
- **UI Progress**: Web Server emits `processing:progress { percent: 20 }` via Socket.IO so the iPad kiosk can show a smooth loading bar.

---

## 6. DEPENDENCIES

| Tool | Usage | Installation |
|---|---|---|
| `sharp` | Resizing, compositing | `npm install sharp` |
| `gifencoder` | GIF building | `npm install gifencoder` |
| `fluent-ffmpeg` | MP4 building | `npm install fluent-ffmpeg` |
| `ffmpeg` (binary) | Video encoding engine | Must be installed on host OS (see SETUP.md) |
