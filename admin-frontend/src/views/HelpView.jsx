import { useState } from "react";
import { HELP_FAQ, HELP_GUIDE, HELP_VIDEO_LABEL, HELP_VIDEOS } from "../lib/help.js";
import Icon from "../components/Icon.jsx";
import VideoDialog from "../dialogs/VideoDialog.jsx";

const TABS = [
  { key: "hi", icon: "smart_display", label: "Hindi Tutorials" },
  { key: "en", icon: "smart_display", label: "English Tutorials" },
  { key: "guide", icon: "menu_book", label: "Guide & FAQ" },
];

function VideoGrid({ lang, onPlay, id }) {
  return (
    <div className="video-grid" id={id}>
      {HELP_VIDEOS[lang].map((videoId, index) => {
        const label = HELP_VIDEO_LABEL[lang](index + 1);
        return (
          <button className="video-card" type="button" key={videoId} onClick={() => onPlay(videoId, label)}>
            <span
              className="video-thumb"
              style={{ backgroundImage: `url('https://i.ytimg.com/vi/${videoId}/hqdefault.jpg')` }}
            >
              <span className="video-play">
                <Icon name="play_arrow" />
              </span>
            </span>
            <span className="video-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function HelpView() {
  const [tab, setTab] = useState("hi");
  const [lang, setLang] = useState("en");
  const [video, setVideo] = useState(null);

  const whenLabel = lang === "hi" ? "कब इस्तेमाल करें" : "When to use";
  const howLabel = lang === "hi" ? "कैसे इस्तेमाल करें" : "How to use it";
  const tipLabel = lang === "hi" ? "सुझाव" : "Tip";

  return (
    <>
      <div className="help-tabs" role="tablist" aria-label="Help sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            className={"help-tab" + (tab === item.key ? " active" : "")}
            type="button"
            role="tab"
            aria-selected={tab === item.key ? "true" : "false"}
            onClick={() => setTab(item.key)}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </div>

      <section className="panel help-panel" hidden={tab !== "hi"}>
        <div className="panel-head compact">
          <div>
            <h2>हिंदी वीडियो ट्यूटोरियल</h2>
            <p>किसी भी वीडियो पर टैप करें और उसे यहीं देखें। ये प्लेलिस्ट क्रम में लगे हैं — शुरुआत से देखें।</p>
          </div>
        </div>
        <VideoGrid lang="hi" id="helpVideosHi" onPlay={(id, label) => setVideo({ id, label })} />
      </section>

      <section className="panel help-panel" hidden={tab !== "en"}>
        <div className="panel-head compact">
          <div>
            <h2>English Video Tutorials</h2>
            <p>Tap any video to play it right here. The clips follow the playlist order — start from the top.</p>
          </div>
        </div>
        <VideoGrid lang="en" id="helpVideosEn" onPlay={(id, label) => setVideo({ id, label })} />
      </section>

      <section className="panel help-panel" hidden={tab !== "guide"}>
        <div className="panel-head compact guide-head">
          <div>
            <h2 data-guide-title>{lang === "hi" ? "टेक्स्ट गाइड और सामान्य सवाल" : "Text Guide & FAQ"}</h2>
            <p data-guide-sub>
              {lang === "hi"
                ? "हर सेक्शन कैसे और कब इस्तेमाल करें, और अपने जिम के हिसाब से कैसे सेट करें।"
                : "How to use each section, when to use it, and how to set it up for your gym."}
            </p>
          </div>
          <div className="lang-toggle" role="group" aria-label="Guide language">
            <button
              className={"lang-btn" + (lang === "en" ? " active" : "")}
              type="button"
              aria-pressed={lang === "en" ? "true" : "false"}
              onClick={() => setLang("en")}
            >
              English
            </button>
            <button
              className={"lang-btn" + (lang === "hi" ? " active" : "")}
              type="button"
              aria-pressed={lang === "hi" ? "true" : "false"}
              onClick={() => setLang("hi")}
            >
              हिंदी
            </button>
          </div>
        </div>
        <div className="guide-list" id="helpGuideList">
          {HELP_GUIDE.map((topic) => {
            const t = topic[lang];
            return (
              <details className="guide-item" key={topic.icon + t.title}>
                <summary>
                  <span className="guide-ico">
                    <Icon name={topic.icon} />
                  </span>
                  <span className="guide-title">{t.title}</span>
                  <Icon name="expand_more" className="guide-chevron" />
                </summary>
                <div className="guide-body">
                  <p className="guide-when">
                    <strong>{whenLabel}:</strong> {t.when}
                  </p>
                  <p className="guide-sub-label">{howLabel}</p>
                  <ol>
                    {t.how.map((step, index) => (
                      // Guide copy carries inline <b> markup in the source data.
                      <li key={index} dangerouslySetInnerHTML={{ __html: step }} />
                    ))}
                  </ol>
                  <p className="guide-tip">
                    <Icon name="lightbulb" />
                    <span>
                      <strong>{tipLabel}:</strong> <span dangerouslySetInnerHTML={{ __html: t.tip }} />
                    </span>
                  </p>
                </div>
              </details>
            );
          })}
        </div>
        <h3 className="faq-heading" data-faq-heading>
          {lang === "hi" ? "अक्सर पूछे जाने वाले सवाल" : "Frequently asked questions"}
        </h3>
        <div className="guide-list faq-list" id="helpFaqList">
          {HELP_FAQ[lang].map((item) => (
            <details className="guide-item faq-item" key={item.q}>
              <summary>
                <span className="guide-title">{item.q}</span>
                <Icon name="expand_more" className="guide-chevron" />
              </summary>
              <div className="guide-body">
                <p dangerouslySetInnerHTML={{ __html: item.a }} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <VideoDialog video={video} onClose={() => setVideo(null)} />
    </>
  );
}
