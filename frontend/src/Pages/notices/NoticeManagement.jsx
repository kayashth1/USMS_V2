import { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/config/firebase";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import { createNotice, deleteNotice, uploadNoticeAttachment } from "@/services/notice.service";
import { Bell, Paperclip, Trash2, X } from "lucide-react";

const AUDIENCE = {
  all:      { label: "Everyone",  className: "bg-indigo-100 text-indigo-700" },
  students: { label: "Students",  className: "bg-blue-100 text-blue-700"    },
  teachers: { label: "Teachers",  className: "bg-green-100 text-green-700"  },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (ts) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const NoticeManagement = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [notices,     setNotices]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [title,       setTitle]       = useState("");
  const [message,     setMessage]     = useState("");
  const [audience,    setAudience]    = useState("");
  const [files,       setFiles]       = useState([]);
  const [submitting,  setSubmitting]  = useState(false);

  const loadNotices = async () => {
    if (!schoolId) return;
    try {
      setLoading(true);
      const q = query(
        collection(db, "notices"),
        where("schoolId", "==", schoolId),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load notices:", err);
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNotices(); }, [schoolId]);

  const handleCreate = async () => {
    if (!title || !message || !audience) {
      alert("Please fill all fields");
      return;
    }
    try {
      setSubmitting(true);
      const uploadedAttachments = [];
      for (const file of files) {
        const attachment = await uploadNoticeAttachment(file);
        uploadedAttachments.push(attachment);
      }
      await createNotice({ title, message, targetAudience: audience, attachments: uploadedAttachments });
      setTitle(""); setMessage(""); setAudience(""); setFiles([]);
      await loadNotices();
    } catch (err) {
      alert(err.message || "Failed to create notice");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (noticeId) => {
    if (!window.confirm("Permanently delete this notice?")) return;
    try {
      await deleteNotice(noticeId);
      await loadNotices();
    } catch (err) {
      alert(err.message || "Failed to delete notice");
    }
  };

  const canSubmit = title.trim() && message.trim() && audience && !submitting;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Notice Management</h1>
        <p className="text-gray-500">Create and manage notices for students and teachers</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Compose form (left column) ── */}
        <Card className="lg:col-span-1">
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold text-base">Post a Notice</h2>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Title</label>
              <Input
                placeholder="e.g. School closed on Friday"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Message</label>
              <Textarea
                placeholder="Write your notice here..."
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Audience</label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger>
                  <SelectValue placeholder="Who should see this?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="students">Students only</SelectItem>
                  <SelectItem value="teachers">Teachers only</SelectItem>
                  <SelectItem value="all">Everyone (Students & Teachers)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* File attachment */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Attachments <span className="normal-case font-normal">(optional)</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-gray-300 cursor-pointer hover:bg-gray-50 transition-colors text-sm text-gray-500">
                <Paperclip size={14} />
                {files.length > 0 ? `${files.length} file(s) selected` : "Click to attach files"}
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files))}
                />
              </label>
              {files.length > 0 && (
                <div className="space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                      <span className="truncate text-gray-600">{f.name}</span>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="ml-2 text-gray-400 hover:text-red-500 shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full" onClick={handleCreate} disabled={!canSubmit}>
              {submitting ? "Publishing..." : "Publish Notice"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Notice list (right columns) ── */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">
              {loading ? "Notices" : `${notices.length} Notice${notices.length !== 1 ? "s" : ""}`}
            </h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5 space-y-2 animate-pulse">
                    <div className="flex justify-between">
                      <div className="h-4 w-48 bg-gray-100 rounded" />
                      <div className="h-5 w-16 bg-gray-100 rounded-full" />
                    </div>
                    <div className="h-3 w-full bg-gray-100 rounded" />
                    <div className="h-3 w-2/3 bg-gray-100 rounded" />
                    <div className="h-3 w-24 bg-gray-100 rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : notices.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center gap-2 text-gray-400">
                <Bell size={32} className="text-gray-200" />
                <p className="text-sm">No notices posted yet</p>
                <p className="text-xs">Create your first notice using the form.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {notices.map((n) => {
                const aud = AUDIENCE[n.targetAudience] ?? AUDIENCE.all;
                return (
                  <Card key={n.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 p-2 rounded-lg bg-indigo-50 text-indigo-500 shrink-0">
                            <Bell size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{n.title}</p>
                            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>

                            {n.attachments?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {n.attachments.map((a, idx) => (
                                  <a
                                    key={idx}
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-full"
                                  >
                                    <Paperclip size={10} />
                                    {a.name}
                                  </a>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2 mt-2">
                              <Badge className={`text-xs ${aud.className}`}>{aud.label}</Badge>
                              <span className="text-xs text-gray-400">{fmt(n.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDelete(n.id)}
                          className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete notice"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoticeManagement;
