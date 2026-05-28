import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "@/config/firebase";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import {
  createNotice,
  deleteNotice,
  uploadNoticeAttachment,
} from "@/services/notice.service";

const NoticeManagement = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  /* ================= STATE ================= */
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [files, setFiles] = useState([]);

  const [submitting, setSubmitting] = useState(false);

  /* ================= LOAD NOTICES ================= */
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
      setNotices(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    } catch (err) {
      console.error("Failed to load notices:", err);
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotices();
  }, [schoolId]);

  /* ================= CREATE NOTICE ================= */
  const handleCreate = async () => {
    if (!title || !message || !targetAudience) {
      alert("Please fill all fields");
      return;
    }

    try {
      setSubmitting(true);

      // 1️⃣ Upload attachments
      const uploadedAttachments = [];
      for (const file of files) {
        const attachment = await uploadNoticeAttachment(file);
        uploadedAttachments.push(attachment);
      }

      // 2️⃣ Create notice
      await createNotice({
        title,
        message,
        targetAudience,
        attachments: uploadedAttachments,
      });

      // 3️⃣ Reset form
      setTitle("");
      setMessage("");
      setTargetAudience("");
      setFiles([]);

      await loadNotices();
    } catch (err) {
      alert(err.message || "Failed to create notice");
    } finally {
      setSubmitting(false);
    }
  };

  /* ================= DELETE NOTICE ================= */
  const handleDelete = async (noticeId) => {
    const ok = window.confirm(
      "This will permanently delete the notice. Continue?"
    );
    if (!ok) return;

    try {
      await deleteNotice(noticeId);
      await loadNotices();
    } catch (err) {
      alert(err.message || "Failed to delete notice");
    }
  };

  return (
    <div className="space-y-6">

      {/* ===== Header ===== */}
      <div>
        <h1 className="text-2xl font-semibold">Notice Management</h1>
        <p className="text-gray-500">
          Create and manage notices for students and teachers
        </p>
      </div>

      {/* ===== Create Notice ===== */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create New Notice</h2>

          <Input
            placeholder="Notice title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Textarea
            placeholder="Notice message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <Select
            value={targetAudience}
            onValueChange={setTargetAudience}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Target audience" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="students">Students</SelectItem>
              <SelectItem value="teachers">Teachers</SelectItem>
              <SelectItem value="all">Students & Teachers</SelectItem>
            </SelectContent>
          </Select>

          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={(e) =>
              setFiles(Array.from(e.target.files))
            }
            className="text-sm"
          />

          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? "Publishing..." : "Publish Notice"}
          </Button>
        </CardContent>
      </Card>

      {/* ===== Notice List ===== */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-gray-500">Loading notices...</p>
          ) : notices.length === 0 ? (
            <p className="p-6 text-gray-500">
              No notices created yet
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Audience</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {notices.map((n) => (
                  <tr key={n.id}>
                    {/* ===== TITLE + MESSAGE + ATTACHMENTS ===== */}
                    <td className="px-4 py-3">
                      <p className="font-medium">{n.title}</p>

                      <p className="text-xs text-gray-500">
                        {n.message}
                      </p>

                      {/* 📎 Attachments */}
                      {n.attachments?.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {n.attachments.map((a, idx) => (
                            <a
                              key={idx}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 underline block"
                            >
                              📎 {a.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 capitalize">
                      {n.targetAudience}
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-500">
                      {n.createdAt?.toDate
                        ? n.createdAt.toDate().toLocaleString()
                        : "-"}
                    </td>

                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => handleDelete(n.id)}
                      >
                        🗑️ Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default NoticeManagement;
