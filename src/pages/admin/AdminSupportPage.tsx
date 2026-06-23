import { LifeBuoy } from "lucide-react";
import "./Admin.css";

export default function AdminSupportPage() {
  return (
    <div>
      <div className="admin-content-header">
        <div>
          <h1>Support</h1>
          <p>Manage support tickets and user inquiries</p>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-empty">
          <LifeBuoy />
          <h3>No support tickets yet</h3>
          <p>When users submit support requests, they'll appear here.</p>
        </div>
      </div>
    </div>
  );
}
