import "./LoadingSpinner.css";

type SpinnerProps = {
  size?: number;
};

const Spinner = ({ size = 40 }: SpinnerProps) => {
  return (
    <div
      className="spinner"
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    />
  );
};

export default Spinner;