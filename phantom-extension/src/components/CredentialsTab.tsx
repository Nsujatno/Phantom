import { useState, useEffect } from "react"
import { Storage } from "@plasmohq/storage"

const storage = new Storage({ area: "local" })

const CredentialsTab = () => {
    const [domain, setDomain] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [savedCreds, setSavedCreds] = useState<Record<string, {email: string, password: string}>>({})

    useEffect(() => {
        loadCreds()
    }, [])

    const loadCreds = async () => {
        const stored = await storage.get("credentials")
        if (stored) {
            setSavedCreds(stored)
        }
    }

    const handleSave = async () => {
        if (!domain || !email || !password) return
        
        // simple normalization for domain (e.g., https://www.workday.com -> workday.com)
        let cleanDomain = domain.toLowerCase().trim()
        cleanDomain = cleanDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

        const newCreds = {
            ...savedCreds,
            [cleanDomain]: { email, password }
        }
        await storage.set("credentials", newCreds)
        setSavedCreds(newCreds)
        setDomain("")
        setEmail("")
        setPassword("")
    }

    const handleDelete = async (targetDomain: string) => {
        const newCreds = { ...savedCreds }
        delete newCreds[targetDomain]
        await storage.set("credentials", newCreds)
        setSavedCreds(newCreds)
    }

    return (
        <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: "14px", marginBottom: "8px", fontWeight: "bold" }}>Saved Credentials</h3>
            <p style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
                Stored locally on your device. Used to bypass login walls.
            </p>
            
            <div style={{ padding: "8px", border: "1px solid #ddd", borderRadius: "6px", marginBottom: "12px" }}>
                <input 
                    placeholder="Domain (e.g. workday.com)"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    style={{ width: "100%", marginBottom: "4px", padding: "4px" }}
                />
                <input 
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: "100%", marginBottom: "4px", padding: "4px" }}
                />
                <input 
                    placeholder="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ width: "100%", marginBottom: "8px", padding: "4px" }}
                />
                <button 
                    onClick={handleSave} 
                    style={{ width: "100%", padding: "6px", background: "#4caf50", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >
                    Add Credential
                </button>
            </div>

            <div style={{ borderTop: "1px solid #eee", paddingTop: "8px" }}>
                {Object.keys(savedCreds).length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#999" }}>No credentials saved yet.</p>
                ) : (
                    Object.entries(savedCreds).map(([dom, cred]) => (
                        <div key={dom} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px", borderBottom: "1px solid #eee", paddingBottom: "4px" }}>
                            <div>
                                <strong>{dom}</strong>
                                <br/>
                                <span style={{ color: "#666" }}>{cred.email}</span>
                            </div>
                            <button 
                                onClick={() => handleDelete(dom)}
                                style={{ background: "transparent", color: "red", border: "none", cursor: "pointer" }}
                            >
                                x
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

export default CredentialsTab;
