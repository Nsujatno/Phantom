import React from "react"

const StopButton = () => {
  const handleStop = async () => {
    console.log("Stopping pipeline...")
    // const res = await stopPipeline()
  }

  return (
    <button 
      onClick={handleStop}
      style={{
        width: "100%",
        padding: "10px",
        background: "#ef4444",
        color: "white",
        border: "none",
        borderRadius: "6px",
        fontWeight: "bold",
        cursor: "pointer"
      }}
    >
      Stop Pipeline
    </button>
  )
}

export default StopButton
