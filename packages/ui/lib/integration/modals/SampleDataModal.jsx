import React from "react";
import { Button } from "../../components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/dialog";
import Data from "../Data.jsx";

const SampleDataModal = ({
  isOpen,
  setOpen,
  friggBaseUrl,
  authToken,
  integrationId,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Integration Sample Data</DialogTitle>
          <DialogDescription>
            See the sample data provided by your integration.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Data
            friggBaseUrl={friggBaseUrl}
            authToken={authToken}
            integrationId={integrationId}
          />
        </div>
        <DialogFooter className="sm:justify-start">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SampleDataModal;
