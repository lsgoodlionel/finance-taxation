import { PayrollShell } from "./PayrollShell";

const shell = PayrollShell({
  header: "header",
  content: "content"
});

if (shell.type !== "div") {
  throw new Error("PayrollShell should render a div root");
}
