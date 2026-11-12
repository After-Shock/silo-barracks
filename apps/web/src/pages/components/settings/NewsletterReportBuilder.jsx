import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import AddLineIcon from "remixicon-react/AddLineIcon";
import ArrowDownLineIcon from "remixicon-react/ArrowDownLineIcon";
import ArrowUpLineIcon from "remixicon-react/ArrowUpLineIcon";
import DeleteBinLineIcon from "remixicon-react/DeleteBinLineIcon";
import ExternalLinkLineIcon from "remixicon-react/ExternalLinkLineIcon";
import FileCopyLineIcon from "remixicon-react/FileCopyLineIcon";
import LayoutMasonryLineIcon from "remixicon-react/LayoutMasonryLineIcon";
import RefreshLineIcon from "remixicon-react/RefreshLineIcon";
import axios from "../../../lib/axios_instance";

export const BLOCK_LIBRARY = [
  { type: "intro", label: "Intro message", text: "A heading and a short welcome.", fields: ["title", "text"] },
  { type: "stats", label: "Headline stats", text: "Plays, watch time, viewers and new items.", fields: ["title", "period"] },
  { type: "recentlyAdded", label: "Recently added", text: "Newest items, optionally from one library.", fields: ["title", "limit", "library", "addedType"] },
  { type: "topWatched", label: "Most watched", text: "Top titles by plays.", fields: ["title", "limit", "period", "mediaType"] },
  { type: "activeUsers", label: "Top viewers", text: "Who watched the most.", fields: ["title", "limit", "period"] },
  { type: "topClients", label: "Apps and devices", text: "Bar chart of the apps people used.", fields: ["title", "limit", "period"] },
  { type: "playMethods", label: "Play methods", text: "Direct play, direct stream and transcode split.", fields: ["title", "period"] },
  { type: "activityByDay", label: "Plays per day", text: "Daily bar chart (up to 31 days).", fields: ["title", "period"] },
  { type: "libraryOverview", label: "Library overview", text: "Item counts and new items per library.", fields: ["title", "limit", "period"] },
  { type: "repairSummary", label: "Repair snapshot", text: "Missing posters, logos and runtimes.", fields: ["title"] },
  { type: "continueWatching", label: "Continue watching", text: "Per-user campaigns only.", fields: ["title", "limit"], perUser: true },
  { type: "myRequests", label: "My requests", text: "Per-user campaigns only (Seerr).", fields: ["title", "limit"], perUser: true },
  { type: "text", label: "Text", text: "Free text. **bold** and blank lines for paragraphs.", fields: ["title", "text"] },
  { type: "customHtml", label: "Custom HTML", text: "Raw HTML dropped into the email.", fields: ["title", "html"] },
  { type: "divider", label: "Divider", text: "A thin line between sections.", fields: [] },
];

const BLOCK_BY_TYPE = Object.fromEntries(BLOCK_LIBRARY.map((block) => [block.type, block]));

let blockCounter = 0;
function newBlock(type, { title = "", options = {} } = {}) {
  blockCounter += 1;
  return {
    id: `${type}-${Date.now().toString(36)}-${blockCounter}`,
    type,
    enabled: true,
    title,
    options: { limit: 8, periodDays: null, mediaType: "all", libraryId: "", text: "", html: "", ...options },
  };
}

export const DEFAULT_REPORT = {
  enabled: false,
  periodDays: 7,
  accentColor: "#6ee7f9",
  subject: "{campaign} - {date}",
  showLogo: true,
  footer: "",
  blocks: [],
};

const PRESETS = [
  {
    key: "weekly",
    label: "Weekly digest",
    build: () => ({
      periodDays: 7,
      subject: "{campaign} - week to {date}",
      blocks: [
        newBlock("intro", { title: "Here's your week on Jellyfin", options: { text: "A quick look at what was added and what everyone watched." } }),
        newBlock("stats"),
        newBlock("recentlyAdded", { options: { limit: 8 } }),
        newBlock("topWatched", { options: { limit: 6 } }),
        newBlock("activeUsers", { options: { limit: 5 } }),
      ],
    }),
  },
  {
    key: "monthly",
    label: "Monthly server report",
    build: () => ({
      periodDays: 30,
      subject: "{campaign} - {period} report",
      blocks: [
        newBlock("stats"),
        newBlock("activityByDay"),
        newBlock("topWatched", { title: "Top movies", options: { limit: 5, mediaType: "movies" } }),
        newBlock("topWatched", { title: "Top shows", options: { limit: 5, mediaType: "shows" } }),
        newBlock("activeUsers", { options: { limit: 10 } }),
        newBlock("topClients", { options: { limit: 6 } }),
        newBlock("playMethods"),
        newBlock("libraryOverview", { options: { limit: 10 } }),
        newBlock("repairSummary"),
      ],
    }),
  },
  {
    key: "personal",
    label: "Personal digest",
    build: () => ({
      periodDays: 7,
      subject: "Your week on Jellyfin",
      blocks: [
        newBlock("continueWatching", { options: { limit: 6 } }),
        newBlock("myRequests", { options: { limit: 6 } }),
        newBlock("recentlyAdded", { options: { limit: 8 } }),
        newBlock("topWatched", { title: "Popular on the server", options: { limit: 5 } }),
      ],
    }),
  },
];

export function normalizeReportDraft(report) {
  return { ...DEFAULT_REPORT, ...(report || {}), blocks: Array.isArray(report?.blocks) ? report.blocks : [] };
}

function BlockFields({ block, fields, libraries, onChange }) {
  const setOption = (key, value) => onChange({ ...block, options: { ...block.options, [key]: value } });
  return (
    <div className="report-block-fields">
      {fields.includes("title") ? (
        <div>
          <Label htmlFor={`rb-${block.id}-heading`}>Heading</Label>
          <Input id={`rb-${block.id}-heading`} value={block.title || ""} placeholder={BLOCK_BY_TYPE[block.type]?.label} onChange={(event) => onChange({ ...block, title: event.target.value })} />
        </div>
      ) : null}
      {fields.includes("limit") ? (
        <div>
          <Label htmlFor={`rb-${block.id}-rows`}>Rows</Label>
          <Input id={`rb-${block.id}-rows`} type="number" min="1" max="25" value={block.options?.limit ?? 8} onChange={(event) => setOption("limit", Number(event.target.value))} />
        </div>
      ) : null}
      {fields.includes("period") ? (
        <div>
          <Label htmlFor={`rb-${block.id}-period`}>Period</Label>
          <NativeSelect id={`rb-${block.id}-period`} value={block.options?.periodDays ?? ""} onChange={(event) => setOption("periodDays", event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">Report default</option>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </NativeSelect>
        </div>
      ) : null}
      {fields.includes("mediaType") || fields.includes("addedType") ? (
        <div>
          <Label htmlFor={`rb-${block.id}-show`}>Show</Label>
          <NativeSelect id={`rb-${block.id}-show`} value={block.options?.mediaType || "all"} onChange={(event) => setOption("mediaType", event.target.value)}>
            <option value="all">Movies and shows</option>
            <option value="movies">Movies only</option>
            <option value="shows">Shows only</option>
          </NativeSelect>
        </div>
      ) : null}
      {fields.includes("library") ? (
        <div>
          <Label htmlFor={`rb-${block.id}-library`}>Library</Label>
          <NativeSelect id={`rb-${block.id}-library`} value={block.options?.libraryId || ""} onChange={(event) => setOption("libraryId", event.target.value)}>
            <option value="">All libraries</option>
            {libraries.map((library) => (
              <option key={library.id} value={library.id}>
                {library.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      {fields.includes("text") ? (
        <div className="report-block-wide">
          <Label htmlFor={`rb-${block.id}-text`}>Text</Label>
          <Textarea id={`rb-${block.id}-text`} rows={3} value={block.options?.text || ""} onChange={(event) => setOption("text", event.target.value)} />
        </div>
      ) : null}
      {fields.includes("html") ? (
        <div className="report-block-wide">
          <Label htmlFor={`rb-${block.id}-html`}>HTML</Label>
          <Textarea id={`rb-${block.id}-html`} rows={4} className="report-code" value={block.options?.html || ""} onChange={(event) => setOption("html", event.target.value)} />
        </div>
      ) : null}
    </div>
  );
}

export default function NewsletterReportBuilder({ report: reportInput, onChange, campaignType, campaignName, campaignId }) {
  const report = useMemo(() => normalizeReportDraft(reportInput), [reportInput]);
  const [libraries, setLibraries] = useState([]);
  const [addType, setAddType] = useState("stats");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [openBlockId, setOpenBlockId] = useState("");
  const timer = useRef(null);
  const perUser = campaignType === "per-user";

  useEffect(() => {
    axios
      .get("/newsletter/report/libraries", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then((response) => setLibraries(response.data?.libraries || []))
      .catch(() => setLibraries([]));
  }, []);

  async function refreshPreview(nextReport = report) {
    try {
      setPreviewing(true);
      setPreviewError("");
      const response = await axios.post(
        "/newsletter/report/preview",
        { report: { ...nextReport, enabled: true }, type: perUser ? "per-user" : "global", campaignName, campaignId: campaignId || undefined },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" } }
      );
      setPreview(response.data);
    } catch (error) {
      setPreviewError(error.response?.data?.error || "Unable to build the preview.");
    } finally {
      setPreviewing(false);
    }
  }

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => refreshPreview(report), 700);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, campaignType, campaignName]);

  const update = (changes) => onChange({ ...report, ...changes });
  const updateBlocks = (blocks) => update({ blocks });
  const updateBlock = (index, block) => updateBlocks(report.blocks.map((current, position) => (position === index ? block : current)));
  const moveBlock = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= report.blocks.length) return;
    const blocks = [...report.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    updateBlocks(blocks);
  };
  const addBlock = () => {
    const block = newBlock(addType);
    updateBlocks([...report.blocks, block]);
    setOpenBlockId(block.id);
  };
  const applyPreset = (preset) => {
    if (report.blocks.length && !window.confirm(`Replace the current blocks with the “${preset.label}” layout?`)) return;
    update({ ...preset.build(), enabled: true });
  };

  function openPreviewTab() {
    if (!preview?.html) return;
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) return;
    previewWindow.opener = null;
    previewWindow.document.open();
    previewWindow.document.write(preview.html);
    previewWindow.document.close();
  }

  return (
    <div className="report-builder">
      <div className="report-builder-editor">
        <section className="newsletter-panel">
          <div className="newsletter-panel-title">
            <LayoutMasonryLineIcon size={19} />
            <h3>Report builder</h3>
          </div>
          <label className="form-check form-switch report-builder-toggle">
            <input
              id="report-builder-enabled"
              type="checkbox"
              role="switch"
              className="form-check-input"
              checked={report.enabled}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
            <span>Use this report layout when the campaign is sent</span>
          </label>
          <p className="newsletter-help">
            When this is off, the campaign uses the simple section switches on the Campaigns tab. Remember to save the campaign after editing the layout.
          </p>
          <div className="report-presets">
            <span>Start from</span>
            {PRESETS.map((preset) => (
              <Button key={preset.key} type="button" size="sm" variant="outline" onClick={() => applyPreset(preset)}>
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="newsletter-form-grid">
            <div>
              <Label htmlFor="report-builder-subject">Subject</Label>
              <Input id="report-builder-subject" value={report.subject} onChange={(event) => update({ subject: event.target.value })} />
              <small className="form-text">Use {"{campaign}"}, {"{date}"} and {"{period}"}.</small>
            </div>
            <div>
              <Label htmlFor="report-builder-period">Default period</Label>
              <NativeSelect id="report-builder-period" value={report.periodDays} onChange={(event) => update({ periodDays: Number(event.target.value) })}>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last year</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="report-builder-accent">Accent colour</Label>
              <div className="report-accent">
                <Input id="report-builder-accent" type="color" value={report.accentColor} onChange={(event) => update({ accentColor: event.target.value })} />
                <code>{report.accentColor}</code>
              </div>
            </div>
            <div>
              <Label>Branding</Label>
              <label className="form-check form-switch">
                <input
                  id="report-show-logo"
                  type="checkbox"
                  role="switch"
                  className="form-check-input"
                  checked={report.showLogo}
                  onChange={(event) => update({ showLogo: event.target.checked })}
                />
                <span>Show the Barracks logo</span>
              </label>
            </div>
          </div>
          <div className="newsletter-recipient-box">
            <Label htmlFor="report-builder-footer">Footer</Label>
            <Textarea id="report-builder-footer" rows={2} value={report.footer} placeholder="Optional footer, e.g. how to request new content" onChange={(event) => update({ footer: event.target.value })} />
          </div>
        </section>

        <section className="newsletter-panel">
          <div className="newsletter-panel-title">
            <h3>Blocks</h3>
            <div className="report-add">
              <NativeSelect size="sm" value={addType} onChange={(event) => setAddType(event.target.value)}>
                {BLOCK_LIBRARY.filter((block) => perUser || !block.perUser).map((block) => (
                  <option key={block.type} value={block.type}>
                    {block.label}
                  </option>
                ))}
              </NativeSelect>
              <Button type="button" size="sm" onClick={addBlock}>
                <AddLineIcon size={15} /> Add
              </Button>
            </div>
          </div>
          <div className="report-block-list">
            {report.blocks.map((block, index) => {
              const definition = BLOCK_BY_TYPE[block.type] || { label: block.type, text: "", fields: [] };
              const open = openBlockId === block.id;
              const unsupported = definition.perUser && !perUser;
              return (
                <article key={block.id} className={`report-block${block.enabled === false ? " is-off" : ""}${unsupported ? " is-warning" : ""}`}>
                  <header>
                    <button type="button" className="report-block-name" onClick={() => setOpenBlockId(open ? "" : block.id)}>
                      <strong>{block.title || definition.label}</strong>
                      <small>{unsupported ? "Only shown in per-user campaigns" : definition.text}</small>
                    </button>
                    <div className="report-block-tools">
                      <label className="form-check form-switch">
                        <input
                          id={`report-block-on-${block.id}`}
                          type="checkbox"
                          role="switch"
                          className="form-check-input"
                          aria-label="Show block"
                          checked={block.enabled !== false}
                          onChange={(event) => updateBlock(index, { ...block, enabled: event.target.checked })}
                        />
                        <span className="visually-hidden">Show block</span>
                      </label>
                      <Button type="button" size="sm" variant="link" title="Move up" disabled={index === 0} onClick={() => moveBlock(index, -1)}>
                        <ArrowUpLineIcon size={16} />
                      </Button>
                      <Button type="button" size="sm" variant="link" title="Move down" disabled={index === report.blocks.length - 1} onClick={() => moveBlock(index, 1)}>
                        <ArrowDownLineIcon size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="link"
                        title="Duplicate"
                        onClick={() => updateBlocks([...report.blocks.slice(0, index + 1), newBlock(block.type, { title: block.title, options: block.options }), ...report.blocks.slice(index + 1)])}
                      >
                        <FileCopyLineIcon size={16} />
                      </Button>
                      <Button type="button" size="sm" variant="link" className="text-danger" title="Remove" onClick={() => updateBlocks(report.blocks.filter((_, position) => position !== index))}>
                        <DeleteBinLineIcon size={16} />
                      </Button>
                    </div>
                  </header>
                  {open && definition.fields.length ? <BlockFields block={block} fields={definition.fields} libraries={libraries} onChange={(next) => updateBlock(index, next)} /> : null}
                </article>
              );
            })}
            {!report.blocks.length ? <div className="newsletter-empty">No blocks yet. Pick a starting layout above or add blocks one at a time.</div> : null}
          </div>
        </section>
      </div>

      <section className="newsletter-panel report-builder-preview">
        <div className="newsletter-panel-title">
          <h3>Live preview</h3>
          <div className="newsletter-preview-actions">
            <Button type="button" size="sm" variant="outline" onClick={() => refreshPreview()} disabled={previewing}>
              {previewing ? <Spinner className="tw:size-4" /> : <RefreshLineIcon size={15} />} Refresh
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={openPreviewTab} disabled={!preview?.html}>
              <ExternalLinkLineIcon size={15} /> Open in tab
            </Button>
          </div>
        </div>
        <div className="newsletter-preview-meta">
          <strong>{preview?.subject || "Report preview"}</strong>
          <span>{perUser ? "Previewed for the first opted-in user" : "Uses live server data"}</span>
        </div>
        {previewError ? <div className="newsletter-empty">{previewError}</div> : null}
        <div className="newsletter-preview-frame">
          {preview?.html ? <iframe title="Report preview" srcDoc={preview.html} /> : <div className="newsletter-empty">Building preview…</div>}
        </div>
      </section>
    </div>
  );
}
