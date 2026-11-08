import React from "react";

export function SkeletonBox({
  width = "100%",
  height = "20px",
  borderRadius = "8px",
  style = {}
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="nw-skeleton"
      style={{
        width,
        height,
        borderRadius,
        ...style
      }}
    />
  );
}

// ============================================================================
// SKELETON DO PAINEL DO CLIENTE (LOJISTA)
// ============================================================================
export function ClientWorkspaceSkeleton({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={embedded ? "op-workspace" : "nw-layout-shell"} style={{ minHeight: "100vh", display: "flex", background: "#080612" }}>
      {/* Sidebar Skeleton */}
      {!embedded && (
        <aside
          className="nw-sidebar"
          style={{
            width: "260px",
            background: "#0c0a18",
            borderRight: "1px solid rgba(255, 255, 255, 0.07)",
            padding: "20px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            flexShrink: 0
          }}
        >
          {/* Logo & Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <SkeletonBox width="42px" height="42px" borderRadius="10px" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <SkeletonBox width="110px" height="15px" />
              <SkeletonBox width="70px" height="11px" />
            </div>
          </div>

          {/* Nav Items */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
            <SkeletonBox width="100%" height="40px" borderRadius="10px" />
            <SkeletonBox width="100%" height="40px" borderRadius="10px" />
            <SkeletonBox width="100%" height="40px" borderRadius="10px" />
            <SkeletonBox width="100%" height="40px" borderRadius="10px" />
            <SkeletonBox width="100%" height="40px" borderRadius="10px" />
            <SkeletonBox width="100%" height="40px" borderRadius="10px" />
          </div>

          {/* Bottom Card */}
          <div style={{ marginTop: "auto", padding: "14px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.05)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <SkeletonBox width="90px" height="14px" />
            <SkeletonBox width="100%" height="8px" borderRadius="4px" />
            <SkeletonBox width="60px" height="12px" />
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: "24px 30px", display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <SkeletonBox width="44px" height="44px" borderRadius="12px" />
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <SkeletonBox width="180px" height="20px" />
              <SkeletonBox width="120px" height="13px" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <SkeletonBox width="140px" height="38px" borderRadius="10px" />
            <SkeletonBox width="40px" height="38px" borderRadius="10px" />
          </div>
        </div>

        {/* Top Banner Skeleton */}
        <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "16px", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1 }}>
            <SkeletonBox width="42px" height="42px" borderRadius="12px" />
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, maxWidth: "480px" }}>
              <SkeletonBox width="220px" height="16px" />
              <SkeletonBox width="100%" height="13px" />
            </div>
          </div>
          <SkeletonBox width="160px" height="38px" borderRadius="10px" />
        </div>

        {/* 3 Quick Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "14px", padding: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <SkeletonBox width="36px" height="36px" borderRadius="10px" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <SkeletonBox width="100px" height="14px" />
              <SkeletonBox width="60px" height="11px" />
            </div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "14px", padding: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <SkeletonBox width="36px" height="36px" borderRadius="10px" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <SkeletonBox width="120px" height="14px" />
              <SkeletonBox width="80px" height="11px" />
            </div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "14px", padding: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <SkeletonBox width="36px" height="36px" borderRadius="10px" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <SkeletonBox width="110px" height="14px" />
              <SkeletonBox width="70px" height="11px" />
            </div>
          </div>
        </div>

        {/* Chat / Workspace Columns */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 2fr)", gap: "16px", flex: 1, minHeight: "420px" }}>
          {/* Chat List Skeleton */}
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "14px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <SkeletonBox width="100%" height="38px" borderRadius="10px" />
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px" }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 8px", borderBottom: "1px solid rgba(255, 255, 255, 0.03)" }}>
                  <SkeletonBox width="40px" height="40px" borderRadius="50%" />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <SkeletonBox width="110px" height="14px" />
                      <SkeletonBox width="40px" height="11px" />
                    </div>
                    <SkeletonBox width="150px" height="11px" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Conversation Skeleton */}
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "14px", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <SkeletonBox width="38px" height="38px" borderRadius="50%" />
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <SkeletonBox width="130px" height="15px" />
                  <SkeletonBox width="80px" height="11px" />
                </div>
              </div>
              <SkeletonBox width="90px" height="28px" borderRadius="8px" />
            </div>

            {/* Messages Body */}
            <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: "4px", maxWidth: "60%" }}>
                <SkeletonBox width="200px" height="42px" borderRadius="14px 14px 14px 4px" />
                <SkeletonBox width="50px" height="10px" />
              </div>
              <div style={{ alignSelf: "flex-end", display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end", maxWidth: "60%" }}>
                <SkeletonBox width="240px" height="52px" borderRadius="14px 14px 4px 14px" />
                <SkeletonBox width="50px" height="10px" />
              </div>
              <div style={{ alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: "4px", maxWidth: "60%" }}>
                <SkeletonBox width="170px" height="38px" borderRadius="14px 14px 14px 4px" />
                <SkeletonBox width="50px" height="10px" />
              </div>
            </div>

            {/* Composer */}
            <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", gap: "10px" }}>
              <SkeletonBox width="100%" height="42px" borderRadius="10px" />
              <SkeletonBox width="46px" height="42px" borderRadius="10px" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// SKELETON DO PAINEL MASTER (ADMIN)
// ============================================================================
export function MasterAdminSkeleton() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#06030b" }}>
      {/* Sidebar Skeleton */}
      <aside
        style={{
          width: "270px",
          background: "#090510",
          borderRight: "1px solid rgba(255, 255, 255, 0.07)",
          padding: "24px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          flexShrink: 0
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "16px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <SkeletonBox width="44px" height="44px" borderRadius="12px" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <SkeletonBox width="120px" height="17px" />
            <SkeletonBox width="80px" height="11px" />
          </div>
        </div>

        {/* Navigation Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <SkeletonBox key={i} width="100%" height="42px" borderRadius="10px" />
          ))}
        </div>

        {/* Master User Card */}
        <div style={{ marginTop: "auto", padding: "14px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", alignItems: "center", gap: "12px" }}>
          <SkeletonBox width="36px" height="36px" borderRadius="50%" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
            <SkeletonBox width="90px" height="13px" />
            <SkeletonBox width="110px" height="10px" />
          </div>
        </div>
      </aside>

      {/* Main Admin Area */}
      <main style={{ flex: 1, padding: "28px 36px", display: "flex", flexDirection: "column", gap: "22px", minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <SkeletonBox width="260px" height="26px" />
            <SkeletonBox width="180px" height="13px" />
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <SkeletonBox width="140px" height="40px" borderRadius="10px" />
            <SkeletonBox width="110px" height="40px" borderRadius="10px" />
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px" }}>
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "14px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <SkeletonBox width="90px" height="13px" />
                <SkeletonBox width="28px" height="28px" borderRadius="8px" />
              </div>
              <SkeletonBox width="110px" height="28px" />
              <SkeletonBox width="70px" height="11px" />
            </div>
          ))}
        </div>

        {/* Search & Filter Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
          <SkeletonBox width="340px" height="42px" borderRadius="10px" />
          <div style={{ display: "flex", gap: "10px" }}>
            <SkeletonBox width="130px" height="42px" borderRadius="10px" />
            <SkeletonBox width="110px" height="42px" borderRadius="10px" />
          </div>
        </div>

        {/* Clients Table Skeleton */}
        <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <SkeletonBox width="140px" height="14px" />
            <SkeletonBox width="100px" height="14px" />
            <SkeletonBox width="90px" height="14px" />
            <SkeletonBox width="80px" height="14px" />
            <SkeletonBox width="60px" height="14px" />
          </div>

          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid rgba(255, 255, 255, 0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "220px" }}>
                <SkeletonBox width="36px" height="36px" borderRadius="50%" />
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <SkeletonBox width="120px" height="14px" />
                  <SkeletonBox width="80px" height="11px" />
                </div>
              </div>
              <SkeletonBox width="110px" height="24px" borderRadius="999px" />
              <SkeletonBox width="90px" height="20px" borderRadius="6px" />
              <SkeletonBox width="80px" height="13px" />
              <div style={{ display: "flex", gap: "8px" }}>
                <SkeletonBox width="32px" height="32px" borderRadius="8px" />
                <SkeletonBox width="32px" height="32px" borderRadius="8px" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
