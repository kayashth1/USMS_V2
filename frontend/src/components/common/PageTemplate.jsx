import { Card, CardContent } from "@/components/ui/card";

const PageTemplate = ({ title }) => {
  return (
    <Card>
      <CardContent className="p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-gray-500 mt-2">
          Dummy UI — functionality will be added later.
        </p>
      </CardContent>
    </Card>
  );
};

export default PageTemplate;
