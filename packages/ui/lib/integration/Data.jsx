import React, { useEffect, useState } from "react";
import API from "../api/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/table";
import { useToast } from "../components/use-toast";

const Data = ({ friggBaseUrl, authToken, integrationId }) => {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      if (authToken) {
        const api = new API(friggBaseUrl, authToken);
        // let sampleData = await api.getSampleData(integrationId);
        let sampleData = getFakeData(); // Uncomment if you need fake data

        if (sampleData && sampleData.error) {
          toast({
            variant: "destructive",
            title: "Oops",
            description: sampleData.error,
          });
          return;
        }

        if (sampleData.constructor !== Array) {
          sampleData = sampleData.data;
        }

        const headers =
          sampleData && sampleData.length ? Object.keys(sampleData[0]) : [];
        const rows = headers && headers.length ? sampleData : [];
        setHeaders(headers);
        setRows(rows);
      }
    };

    fetchData();
  }, [authToken, friggBaseUrl, integrationId, toast]);

  // Fake data for testing
  const getFakeData = () => {
    return [
      {
        name: "John Doe",
        age: 25,
        city: "New York",
        state: "NY",
        phone: "123-456-7890",
      },
      {
        name: "Jane Doe",
        age: 22,
        city: "Los Angeles",
        state: "CA",
        phone: "987-654-3210",
      },
      {
        name: "John Smith",
        age: 30,
        city: "Chicago",
        state: "IL",
        phone: "765-432-1098",
      },
      {
        name: "Jane Smith",
        age: 28,
        city: "Houston",
        state: "TX",
        phone: "210-987-6543",
      },
    ];
  };

  return headers.length > 0 ? (
    <div className="m-3 border rounded">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, idx) => (
              <TableHead key={idx}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item, idx) => (
            <TableRow key={idx}>
              {Object.values(item).map((val, idxVal) => (
                <TableCell key={idxVal}>{`${val}`}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ) : (
    <div className="flex w-full justify-center m-5">
      <h1 className="text-lg">No data available</h1>
    </div>
  );
};

export default Data;
