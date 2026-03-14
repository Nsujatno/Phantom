import React from "react"

const StatusCard = () => {
  return (
    <div style={{ background: "#fff", padding: "12px", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", marginBottom: "16px" }}>
      <p style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>Status: Idle</p>
      <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#666" }}>0 jobs applied today</p>
    </div>
  )
}

export default StatusCard
