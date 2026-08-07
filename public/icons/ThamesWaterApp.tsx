import { useEffect, useState } from "react";
import { useFadingError } from "./useFadingError";

interface ThamesWaterJob {
  id: string;
  title: string;
  department: string;
  description?: string;
  postedByUsername?: string;
  createdAt?: number;
}

interface ThamesWaterService {
  name: string;
  description: string;
}

const SERVICES: ThamesWaterService[] = [
  { name: "Water Supply", description: "Clean, safe drinking water delivered across the Westbridge network." },
  { name: "Wastewater & Sewerage", description: "Collection and treatment of wastewater from homes and businesses." },
  { name: "Leak Reporting & Repairs", description: "Report a leak or burst main and track repair crews in your area." },
  { name: "Water Quality & Testing", description: "Ongoing testing to keep supply safe and compliant with standards." },
  { name: "Billing & Payments", description: "Manage your account, view usage, and set up payment plans." },
  { name: "Emergency Response", description: "24/7 response for supply interruptions and major incidents." },
];

const THAMES_WATER_DISCORD_URL = "";

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString();
}

export function ThamesWaterApp({ username }: { username: string }) {
  const [jobs, setJobs] = useState<ThamesWaterJob[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const [showAddJob, setShowAddJob] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDepartment, setJobDepartment] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [submittingJob, setSubmittingJob] = useState(false);
  const { error: jobError, setError: setJobError } = useFadingError();
  const [removingJobId, setRemovingJobId] = useState<string | null>(null);

  async function loadJobs() {
    setLoadingJobs(true);
    try {
      const res = await fetch("/api/blume-content?type=thamesWater");
      const data = await res.json();
      setJobs(data.jobs || []);
      setCanManage(!!data.canManage);
    } finally {
      setLoadingJobs(false);
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  async function handleAddJob() {
    if (!jobTitle.trim()) return;
    setSubmittingJob(true);
    setJobError(null);
    try {
      const res = await fetch("/api/blume-content?type=thamesWater", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: jobTitle.trim(),
          department: jobDepartment.trim(),
          description: jobDescription.trim(),
        }),
      });
      if (!res.ok) {
        setJobError(await res.text());
        return;
      }
      setJobTitle("");
      setJobDepartment("");
      setJobDescription("");
      setShowAddJob(false);
      await loadJobs();
    } catch {
      setJobError("Couldn't reach the server.");
    } finally {
      setSubmittingJob(false);
    }
  }

  async function handleRemoveJob(id: string) {
    setRemovingJobId(id);
    try {
      await fetch(`/api/blume-content?type=thamesWater&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await loadJobs();
    } finally {
      setRemovingJobId(null);
    }
  }

  return (
    <div className="thames-app">
      <div className="thames-hero">
        <img className="thames-logo" src="/thames-water-logo.png" alt="Thames Water" />
      </div>

      <div className="thames-section">
        <h3 className="thames-section-title">Services</h3>
        <div className="thames-service-grid">
          {SERVICES.map((s) => (
            <div key={s.name} className="thames-service-card">
              <span className="thames-service-name">{s.name}</span>
              <p className="thames-service-desc">{s.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="thames-section">
        <div className="thames-section-head">
          <h3 className="thames-section-title">Job Openings</h3>
          {canManage && (
            <button className="thames-btn thames-btn-small" onClick={() => setShowAddJob((v) => !v)}>
              {showAddJob ? "Cancel" : "+ Add opening"}
            </button>
          )}
        </div>

        {showAddJob && (
          <div className="thames-add-job-form">
            <input
              className="thames-input"
              placeholder="Job title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
            <input
              className="thames-input"
              placeholder="Department (optional)"
              value={jobDepartment}
              onChange={(e) => setJobDepartment(e.target.value)}
            />
            <textarea
              className="thames-textarea"
              placeholder="Description (optional)"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
            <button
              className="thames-btn"
              disabled={!jobTitle.trim() || submittingJob}
              onClick={handleAddJob}
            >
              {submittingJob ? "Posting…" : "Post opening"}
            </button>
            {jobError && <p className="thames-error">{jobError}</p>}
          </div>
        )}

        {loadingJobs ? (
          <p className="thames-muted">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="thames-muted">No open roles at the moment.</p>
        ) : (
          <div className="thames-job-list">
            {jobs.map((j) => (
              <div key={j.id} className="thames-job-card">
                <div className="thames-job-head">
                  <span className="thames-job-title">{j.title}</span>
                  {j.department && <span className="thames-job-department">{j.department}</span>}
                </div>
                {j.description && <p className="thames-job-desc">{j.description}</p>}
                {canManage && (
                  <div className="thames-job-meta">
                    <span>
                      Posted by {j.postedByUsername} on {formatDate(j.createdAt!)}
                    </span>
                    <button
                      className="thames-remove-btn"
                      disabled={removingJobId === j.id}
                      onClick={() => handleRemoveJob(j.id)}
                    >
                      {removingJobId === j.id ? "…" : "Remove"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="thames-section thames-contact-section">
        <h3 className="thames-section-title">Discord Server</h3>
        <p className="thames-muted">Join our Discord to connect with the Thames Water team.</p>
        <button
          className="thames-btn thames-contact-btn"
          disabled={!THAMES_WATER_DISCORD_URL}
          onClick={() => {
            if (THAMES_WATER_DISCORD_URL) window.open(THAMES_WATER_DISCORD_URL, "_blank");
          }}
        >
          Contact Us
        </button>
        {!THAMES_WATER_DISCORD_URL && <p className="thames-muted thames-coming-soon">Discord link coming soon.</p>}
      </div>

      <div className="thames-footer">
        <span className="thames-footer-note">Signed in as {username}</span>
      </div>
    </div>
  );
}
