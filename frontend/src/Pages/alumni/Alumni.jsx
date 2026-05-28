import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import { getAlumniBySchool } from "@/services/alumni.service";

const Alumni = () => {
  const schoolId = localStorage.getItem("principalSchoolId");

  const [alumni, setAlumni]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [searchName, setSearchName] = useState("");
  const [filterYear, setFilterYear] = useState("all");

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    getAlumniBySchool(schoolId)
      .then(setAlumni)
      .finally(() => setLoading(false));
  }, [schoolId]);

  const academicYears = useMemo(
    () => [...new Set(alumni.map((a) => a.academicYear).filter(Boolean))].sort().reverse(),
    [alumni]
  );

  const filtered = useMemo(
    () =>
      alumni.filter((a) => {
        if (filterYear !== "all" && a.academicYear !== filterYear) return false;
        if (searchName && !a.fullName?.toLowerCase().includes(searchName.toLowerCase())) return false;
        return true;
      }),
    [alumni, filterYear, searchName]
  );

  // Group by academic year for display
  const grouped = useMemo(() => {
    if (filterYear !== "all") return { [filterYear]: filtered };
    return filtered.reduce((acc, a) => {
      const y = a.academicYear || "Unknown";
      acc[y] = acc[y] || [];
      acc[y].push(a);
      return acc;
    }, {});
  }, [filtered, filterYear]);

  const sortedYears = Object.keys(grouped).sort().reverse();

  if (loading) return <p className="p-6 text-gray-500">Loading alumni...</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Alumni</h1>
        <p className="text-gray-500">Graduated students organised by academic year</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-gray-500">Total Alumni</p>
            <p className="text-2xl font-bold text-indigo-600">{alumni.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-gray-500">Batches</p>
            <p className="text-2xl font-bold">{academicYears.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-gray-500">Latest Batch</p>
            <p className="text-2xl font-bold">{academicYears[0] || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-gray-500">Showing</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <Input
            placeholder="Search by name..."
            className="w-56"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
          />
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Batches</SelectItem>
              {academicYears.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Alumni grouped by year */}
      {alumni.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-gray-400">
            <p className="text-4xl mb-3">🎓</p>
            <p className="font-medium">No alumni yet</p>
            <p className="text-sm mt-1">
              Alumni appear here when Class {" "}
              <span className="font-medium">12</span> students are graduated
              via Academic Management → Class Promotion.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No results match your filters.</p>
      ) : (
        sortedYears.map((year) => (
          <div key={year} className="space-y-3">
            {/* Year header */}
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Batch {year}</h2>
              <Badge variant="outline">{grouped[year].length} students</Badge>
            </div>

            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Roll</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Final Class</th>
                      <th className="px-4 py-3 text-left">Parent</th>
                      <th className="px-4 py-3 text-left">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {grouped[year]
                      .sort((a, b) => Number(a.roll) - Number(b.roll))
                      .map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{a.roll || "—"}</td>
                          <td className="px-4 py-3 font-medium">{a.fullName}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{a.email}</td>
                          <td className="px-4 py-3">
                            <Badge className="bg-indigo-100 text-indigo-700">
                              {a.finalClassLabel}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{a.parentName || "—"}</td>
                          <td className="px-4 py-3">{a.contact || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        ))
      )}
    </div>
  );
};

export default Alumni;
