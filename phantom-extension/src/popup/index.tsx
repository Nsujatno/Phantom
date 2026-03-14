import { useState } from "react"
import "./styles.css"
import StatusCard from "../components/StatusCard"
import StopButton from "../components/StopButton"

function IndexPopup() {
  const [data, setData] = useState("")

  return (
    <div style={{ padding: 16, width: 300 }}>
      <h2 style={{ marginBottom: 16 }}>Auto Job Agent</h2>
      <StatusCard />
      <StopButton />
    </div>
  )
}

export default IndexPopup
