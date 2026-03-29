import { useState } from "react"
import "./styles.css"
import StatusCard from "../components/StatusCard"
import StopButton from "../components/StopButton"
import CredentialsTab from "../components/CredentialsTab"

function IndexPopup() {
  const [activeTab, setActiveTab] = useState("status")

  return (
    <div style={{ padding: 16, width: 320, fontFamily: "sans-serif" }}>
      <h2 style={{ marginBottom: 12, borderBottom: "1px solid #eee", paddingBottom: 8 }}>Auto Job Agent</h2>
      
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button 
          onClick={() => setActiveTab("status")}
          style={{ padding: "4px 8px", background: activeTab === "status" ? "#007bff" : "#f0f0f0", color: activeTab === "status" ? "white" : "black", border: "none", borderRadius: "4px", cursor: "pointer", flex: 1 }}
        >
          Status
        </button>
        <button 
          onClick={() => setActiveTab("credentials")}
          style={{ padding: "4px 8px", background: activeTab === "credentials" ? "#007bff" : "#f0f0f0", color: activeTab === "credentials" ? "white" : "black", border: "none", borderRadius: "4px", cursor: "pointer", flex: 1 }}
        >
          Credentials
        </button>
      </div>

      {activeTab === "status" ? (
        <div>
          <StatusCard />
          <StopButton />
        </div>
      ) : (
        <CredentialsTab />
      )}
    </div>
  )
}

export default IndexPopup
