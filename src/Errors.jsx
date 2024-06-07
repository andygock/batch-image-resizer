export default function Errors({ errors }) {
  return (
    <div>
      {/* display list of errors */}
      {errors.length > 0 && (
        <div>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>
                <span className="red large">⚠</span> {error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
