import Dialog from "../components/Dialog.jsx";

export default function VideoDialog({ video, onClose }) {
  return (
    <Dialog
      className="video-dialog"
      id="videoDialog"
      aria-label="Video tutorial"
      open={Boolean(video)}
      onClose={onClose}
      // Close when the dark backdrop area (the dialog element itself) is clicked.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button className="video-dialog-close" id="videoDialogClose" aria-label="Close video" type="button" onClick={onClose}>
        ×
      </button>
      {/* Unmounting the iframe on close is what stops the video (and its audio). */}
      <div className="video-dialog-frame" id="videoDialogFrame">
        {video ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
            title={video.label}
            frameBorder="0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          ></iframe>
        ) : null}
      </div>
      <p className="video-dialog-label" id="videoDialogLabel">
        {video?.label || ""}
      </p>
    </Dialog>
  );
}
