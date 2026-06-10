import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INPUT_TYPE = { text: "text", number: "number", date: "date" };

// Reusable form section that renders dynamic custom fields.
// Props:
//   defs    — array of field definition objects from customFieldDefs collection
//   values  — object mapping fieldId → current value
//   onChange(fieldId, value) — called on every change
const CustomFieldsForm = ({ defs, values, onChange }) => {
  if (!defs || defs.length === 0) return null;

  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Additional Details
      </p>
      {defs.map((field) => (
        <div key={field.id} className="space-y-1">
          <Label>
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          <Input
            type={INPUT_TYPE[field.type] || "text"}
            value={values[field.id] ?? ""}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
};

export default CustomFieldsForm;
