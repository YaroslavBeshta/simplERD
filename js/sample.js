/**
 * @file Built-in marketing-agency CRM sample diagram.
 */
"use strict";

/**
 * @returns {DiagramState} The built-in marketing-agency CRM diagram.
 */
function buildSampleState() {
  const col = (name, dataType, o) =>
    Object.assign(
      {
        name,
        dataType: dataType || "TEXT",
        isPk: false,
        isFk: false,
        refTable: null,
        refCol: null,
        fkType: "N:1",
      },
      o || {},
    );
  const pk = (name, dataType) =>
    col(name, dataType || "INTEGER", { isPk: true });
  const fk = (name, refTable, refCol, o) =>
    col(
      name,
      "INTEGER",
      Object.assign({ isFk: true, refTable, refCol }, o || {}),
    );
  const T = (name, x, y, width, headerColor, bodyColor, columns) => ({
    name,
    x,
    y,
    width,
    headerColor,
    bodyColor,
    columns,
  });

  // Domain colors: people=blue, sales=green, leads=amber, marketing=purple,
  // lookups=gray, activity=rose.
  const tables = [
    T("Industry", 140, 200, 200, "#6c757d", "#f4f5f6", [
      pk("industry_id"),
      col("name", "VARCHAR(255)"),
      col("description", "TEXT"),
    ]),
    T("LeadSource", 140, 480, 200, "#c07a2d", "#fdf4e7", [
      pk("source_id"),
      col("name", "VARCHAR(255)"),
      col("cost_per_lead", "DECIMAL"),
    ]),
    T("Employee", 140, 780, 220, "#3b6ea5", "#eef4fb", [
      pk("employee_id"),
      col("first_name", "VARCHAR(255)"),
      col("last_name", "VARCHAR(255)"),
      col("email", "VARCHAR(255)"),
      col("role", "VARCHAR(255)"),
      col("hire_date", "DATE"),
    ]),
    T("Lead", 560, 380, 260, "#c07a2d", "#fdf4e7", [
      pk("lead_id"),
      col("first_name", "VARCHAR(255)"),
      col("last_name", "VARCHAR(255)"),
      col("email", "VARCHAR(255)"),
      col("phone", "VARCHAR(255)"),
      col("company_name", "VARCHAR(255)"),
      fk("industry_id", "Industry", "industry_id"),
      fk("source_id", "LeadSource", "source_id"),
      fk("assigned_to", "Employee", "employee_id"),
      col("lead_score", "INTEGER"),
      col("status", "VARCHAR(255)"),
      col("created_at", "TIMESTAMP"),
      fk("converted_customer_id", "Customer", "customer_id", { fkType: "1:1" }),
    ]),
    T("Customer", 560, 880, 260, "#2e7d5b", "#ecf7f1", [
      pk("customer_id"),
      col("company_name", "VARCHAR(255)"),
      col("contact_name", "VARCHAR(255)"),
      col("email", "VARCHAR(255)"),
      col("phone", "VARCHAR(255)"),
      fk("industry_id", "Industry", "industry_id"),
      fk("account_manager_id", "Employee", "employee_id"),
      col("customer_since", "DATE"),
      col("annual_value", "DECIMAL"),
      col("is_active", "BOOLEAN"),
    ]),
    T("Campaign", 1080, 200, 240, "#7a4fa3", "#f5effb", [
      pk("campaign_id"),
      col("name", "VARCHAR(255)"),
      fk("channel_id", "Channel", "channel_id"),
      fk("manager_id", "Employee", "employee_id"),
      col("budget", "DECIMAL"),
      col("start_date", "DATE"),
      col("end_date", "DATE"),
      col("status", "VARCHAR(255)"),
    ]),
    T("Channel", 1560, 200, 200, "#7a4fa3", "#f5effb", [
      pk("channel_id"),
      col("name", "VARCHAR(255)"),
      col("is_digital", "BOOLEAN"),
    ]),
    T("CampaignMembership", 1080, 640, 240, "#c07a2d", "#fdf4e7", [
      pk("membership_id"),
      fk("campaign_id", "Campaign", "campaign_id"),
      fk("lead_id", "Lead", "lead_id"),
      col("joined_at", "TIMESTAMP"),
      col("response_status", "VARCHAR(255)"),
    ]),
    T("Interaction", 1080, 920, 240, "#a34f5f", "#fbeff1", [
      pk("interaction_id"),
      fk("lead_id", "Lead", "lead_id"),
      fk("customer_id", "Customer", "customer_id"),
      fk("employee_id", "Employee", "employee_id"),
      fk("channel_id", "Channel", "channel_id"),
      col("subject", "VARCHAR(255)"),
      col("notes", "TEXT"),
      col("interaction_date", "DATETIME"),
    ]),
    T("Deal", 1560, 680, 240, "#2e7d5b", "#ecf7f1", [
      pk("deal_id"),
      fk("customer_id", "Customer", "customer_id"),
      fk("campaign_id", "Campaign", "campaign_id"),
      fk("owner_id", "Employee", "employee_id"),
      col("title", "VARCHAR(255)"),
      col("amount", "DECIMAL"),
      col("stage", "VARCHAR(255)"),
      col("expected_close", "DATE"),
    ]),
  ];

  const st = newState();
  for (const t of tables) st.tables[t.name] = t;
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.isFk)
        st.relationships.push({
          table1: t.name,
          fkCol: c.name,
          table2: c.refTable,
          pkCol: c.refCol,
          type: c.fkType || "N:1",
          verticalX: null,
        });
    }
  }
  st.notes =
    "Sample: marketing agency CRM.\n" +
    "Campaigns run on channels and are managed by employees. Leads arrive from " +
    "sources, join campaigns, get scored and assigned, and convert 1:1 into " +
    "customers. Deals and interactions track revenue and every touchpoint.";
  st.canvasNotes = [
    {
      id: "n1",
      x: 140,
      y: 40,
      width: 300,
      height: 130,
      color: "#fff4c2",
      text: "Marketing agency CRM\nBlue people · green revenue\nAmber leads · purple campaigns\nRose is every touchpoint.",
    },
    {
      id: "n2",
      x: 560,
      y: 140,
      width: 260,
      height: 120,
      color: "#dbeafe",
      text: "A lead converts 1:1 into a customer via converted_customer_id.",
    },
  ];
  return st;
}

/**
 * Replace the open diagram with {@link buildSampleState}, after a save prompt.
 * @returns {Promise<void>}
 */
async function loadSampleDiagram() {
  if (!(await ensureSavedThen())) return;
  undoStack.length = 0;
  redoStack.length = 0;
  state = buildSampleState();
  savedSnapshot = ""; // sample counts as unsaved work
  fileName = null;
  fileHandle = null;
  sel = null;
  update();
  fitToContent();
  toast("Sample marketing CRM diagram loaded");
}
