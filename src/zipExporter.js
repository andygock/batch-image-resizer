import JSZip from "jszip";
import { createJobOwner } from "./jobs.js";

export function createZipExporter(save, createZip = () => new JSZip()) {
  const owner = createJobOwner();
  let busy = false;
  let publish;
  let state = {};
  return {
    cancel(notify = true) {
      owner.cancel();
      busy = false;
      if (notify) publish?.({ ...state, isZipping: false, message: "Export cancelled." });
    },
    async start(outputs, filename, onProgress) {
      if (busy || !outputs.length) return;
      busy = true;
      publish = onProgress;
      const job = owner.start();
      const snapshot = outputs.map((output) => ({ ...output }));
      state = { isZipping: true, progress: 0, error: "", filename, count: snapshot.length, message: "" };
      publish(state);
      try {
        const zip = createZip();
        for (const { downloadFilename, blob } of snapshot) zip.file(downloadFilename, blob);
        const blob = await zip.generateAsync({ type: "blob" }, ({ percent }) => {
          job.signal.throwIfAborted();
          const progress = Math.floor(percent);
          if (state.progress !== progress) {
            state = { ...state, progress };
            publish(state);
          }
        });
        if (!job.isCurrent()) return;
        save(blob, filename);
        state = { ...state, progress: 100, message: `Download requested: ${filename}` };
        return snapshot;
      } catch (error) {
        if (job.isCurrent()) state = { ...state, error: `Could not create ZIP: ${error.message}. Try exporting fewer images together.` };
      } finally {
        if (job.isCurrent()) {
          busy = false;
          state = { ...state, isZipping: false };
          publish(state);
        }
      }
    },
  };
}
