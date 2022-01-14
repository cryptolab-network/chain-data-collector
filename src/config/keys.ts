
const config = () => {
  if (process.env.NODE_ENV === 'production') {
    return require('./prod');
  } else if (process.env.NODE_ENV === 'test') {
    return require('./test');
  } else {
    return require('./dev');
  }
}
console.log(config());
export const keys = config();
