import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      {/* Hero */}
      <section
        className="p-8 text-primary-foreground lg:p-12"
        style={{
          background:
            "linear-gradient(135deg, hsl(183,82%,31%) 0%, hsl(183,60%,24%) 52%, hsl(183,50%,35%) 100%)",
        }}
      >
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_340px]">
          <div>
            <h1 className="mb-5 text-2xl font-bold leading-tight lg:text-3xl">
              Advance your career through professional accreditation
            </h1>
            <p className="mb-8 max-w-2xl text-sm leading-relaxed opacity-90 lg:text-base">
              Use your dashboard to manage bookings, review current reservations, and continue your
              accreditation process from one place.
            </p>
            <Link to="/exam/booking">
              <Button
                className="min-w-[200px] bg-card text-primary font-bold hover:bg-card/90"
              >
                Start Verification
              </Button>
            </Link>
          </div>

          <div className="rounded-2xl p-5" style={{ background: "rgba(40,89,95,0.28)", backdropFilter: "blur(2px)" }}>
            {[
              "Select your occupation",
              "Enter your data",
              "Review and confirm your information",
              "Pay for the verification",
            ].map((text, i) => (
              <div key={i} className="mb-5 flex items-center gap-4 last:mb-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-primary-foreground/80 text-sm font-extrabold">
                  {i + 1}
                </span>
                <strong className="text-sm lg:text-base">{text}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="p-6 lg:px-10">
        <div className="mb-4 flex gap-4 border-b border-border pl-2">
          <span className="border-b-2 border-primary pb-2 text-sm font-semibold text-foreground">
            Bookings
          </span>
          <span className="pb-2 text-sm text-muted-foreground">Requests</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Occupation
              </span>
              <h2 className="mt-1 text-lg font-bold text-foreground">Manage your exam bookings</h2>
            </div>
            <div className="flex gap-3">
              <Link to="/exam/booking">
                <Button size="sm">New booking</Button>
              </Link>
              <Link to="/exam/reservations">
                <Button size="sm" variant="outline">View details</Button>
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Account", value: user?.email || user?.login || "-" },
              { label: "Booking status", value: "Ready", dot: true },
              { label: "Methodology", value: "Direct Assessment" },
              { label: "Actions", value: "Book, review, reschedule" },
            ].map((item) => (
              <div key={item.label}>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </span>
                <strong className="mt-1 flex items-center gap-2 text-sm text-foreground">
                  {item.dot && <span className="h-2 w-2 rounded-full bg-success" />}
                  {item.value}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}
