type Props = {
  name: string;
  picture: string;
};

const Avatar = ({ name, picture }: Props) => {
  return (
    <div className="author-chip">
      <img src={picture} alt="" aria-hidden="true" />
      <span>{name}</span>
    </div>
  );
};

export default Avatar;
