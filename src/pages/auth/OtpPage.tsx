import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiAuth } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function OtpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login: authLogin } = useAuth();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [otpMethod, setOtpMethod] = useState("email");
  const [otpAttempt, setOtpAttempt] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const queryLogin = searchParams.get("login");
    const queryPassword = searchParams.get("password");
    const queryOtpMethod = searchParams.get("otpMethod");
    const storedLogin = sessionStorage.getItem("tmp_login") || "";
    const storedPassword = sessionStorage.getItem("tmp_password") || "";
    const storedOtpMethod = sessionStorage.getItem("tmp_otpMethod") || "email";
    setLogin(queryLogin || storedLogin);
    setPassword(queryPassword || storedPassword);
    setOtpMethod(queryOtpMethod || storedOtpMethod);
  }, [searchParams]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Verifying OTP...");
    try {
      const res = await apiAuth("/otp-verify", { login, password, otp_attempt: otpAttempt, otp_method: otpMethod });
      sessionStorage.removeItem("tmp_login");
      sessionStorage.removeItem("tmp_password");
      sessionStorage.removeItem("tmp_otpMethod");
      setMsg("Login successful. Redirecting to dashboard...");
      navigate("/dashboard");
    } catch (err: any) {
      setMsg(JSON.stringify(err.data || err.message));
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-heading">
          <h1>OTP verification</h1>
          <p>Enter the OTP sent to your selected method and complete sign in.</p>
        </div>

        <div className="auth-meta">
          <span>Account</span>
          <strong>{login || ""}</strong>
          <span>Verify by</span>
          <strong>{(otpMethod || "").toUpperCase()}</strong>
        </div>

        <form className="auth-form" onSubmit={verify}>
          <label>OTP Code</label>
          <input
            value={otpAttempt}
            onChange={(e) => setOtpAttempt(e.target.value)}
            placeholder="Enter OTP code"
            required
          />
          <button type="submit" className="auth-submit">Verify OTP</button>
          <p className="auth-message">{msg}</p>
        </form>
      </div>
    </div>
  );
}
