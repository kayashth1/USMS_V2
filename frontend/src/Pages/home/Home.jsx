import { Link } from "react-router-dom";
import { auth, db } from "@/config/firebase";

console.log("Firebase Auth:", auth);
console.log("Firestore:", db);


const Home = () => {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      
      {/* ================= NAVBAR ================= */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-indigo-600">
            USMS
          </h1>
          <Link
            to="/login"
            className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Principal Login
          </Link>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-4xl font-bold leading-tight">
            A Smart Way to <span className="text-indigo-600">Manage Your School</span>
          </h2>
          <p className="mt-5 text-gray-600">
            Universal School Management System helps principals manage
            students, teachers, attendance, academics, and communication
            from one powerful dashboard.
          </p>

          <div className="mt-8 flex gap-4">
            <Link
              to="/login"
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium"
            >
              Login as Principal
            </Link>
          </div>
        </div>

        {/* Placeholder visual */}
        <div className="bg-white rounded-2xl shadow-md h-72 flex items-center justify-center text-gray-400">
          <img src="./hero.png" alt="" />
        </div>
      </section>

      {/* ================= WHO IT’S FOR ================= */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h3 className="text-2xl font-semibold">
            Built for School Leadership
          </h3>
          <p className="mt-3 text-gray-600">
            Designed specifically for principals and school administrators.
          </p>

          <div className="grid md:grid-cols-3 gap-8 mt-10">
            {[
              "Principals & School Heads",
              "Academic Coordinators",
              "School Management Trusts",
            ].map((role) => (
              <div
                key={role}
                className="p-6 bg-gray-50 rounded-xl shadow-sm"
              >
                <h4 className="font-medium">{role}</h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-semibold text-center">
            Everything You Need, One Platform
          </h3>

          <div className="grid md:grid-cols-3 gap-8 mt-12">
            {[
              {
                title: "Student & Teacher Management",
                desc: "Complete profiles, class assignments, and records.",
              },
              {
                title: "Attendance & Academics",
                desc: "Daily attendance, performance tracking, results.",
              },
              {
                title: "Notices & Content",
                desc: "School-wide announcements and digital resources.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white p-6 rounded-xl shadow-sm"
              >
                <h4 className="font-semibold">{item.title}</h4>
                <p className="text-gray-600 mt-2 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="bg-indigo-50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-2xl font-semibold text-center">
            How USMS Works
          </h3>

          <div className="grid md:grid-cols-3 gap-8 mt-12 text-center">
            {[
              "Principal gets login from Super Admin",
              "Manage school data from admin dashboard",
              "Teachers & students use connected apps",
            ].map((step, index) => (
              <div key={step}>
                <div className="w-10 h-10 mx-auto rounded-full bg-indigo-600 text-white flex items-center justify-center">
                  {index + 1}
                </div>
                <p className="mt-4 text-sm text-gray-700">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="py-20 text-center">
        <h3 className="text-3xl font-bold">
          Ready to Digitize Your School?
        </h3>
        <p className="mt-3 text-gray-600">
          Secure. Scalable. Built for modern education.
        </p>

        <Link
          to="/login"
          className="inline-block mt-6 px-8 py-3 bg-indigo-600 text-white rounded-lg"
        >
          Get Started
        </Link>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="bg-white py-6 text-center text-sm text-gray-500">
        © 2025 Universal School Management System. All rights reserved.
      </footer>
    </div>
  );
};

export default Home;
