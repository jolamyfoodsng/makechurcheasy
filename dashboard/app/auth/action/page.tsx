import { Suspense } from "react";
import FirebaseAuthAction from "./FirebaseAuthAction";

export default function AuthActionPage() {
  return (
    <Suspense>
      <FirebaseAuthAction />
    </Suspense>
  );
}
