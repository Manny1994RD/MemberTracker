'use strict';
// Spanish versions of the messages people can see. The app sends "X-Lang: es" when it shows Spanish.
const ES = {
  'The code can only have numbers.': 'El código solo puede tener números.',
  'The code needs 4 to 8 digits.': 'El código necesita de 4 a 8 dígitos.',
  'Too many wrong codes. Wait 15 minutes and try again.': 'Demasiados códigos incorrectos. Espera 15 minutos e intenta de nuevo.',
  'That code isn’t right.': 'Ese código no es correcto.',
  'Please enter the code.': 'Por favor, escribe el código.',
  'This needs the app code.': 'Esto necesita el código de la app.',
  'Enter this team’s code first.': 'Primero escribe el código de este equipo.',
  'Changing the fruit goal or the team leader needs the app code.': 'Cambiar la meta de fruto o el líder del equipo necesita el código de la app.',
  'A member can’t be moved to another team here.': 'Aquí no se puede mover un miembro a otro equipo.',
  'A team already uses that code. Choose a different one.': 'Un equipo ya usa ese código. Elige otro.',
  'That code is already in use. Choose a different one.': 'Ese código ya está en uso. Elige otro.',
  'That team doesn’t exist.': 'Ese equipo no existe.',
  'That record no longer exists.': 'Ese registro ya no existe.',
  'The request is too large.': 'La solicitud es demasiado grande.',
  'a member needs a team': 'El miembro necesita un equipo.',
  'name is required': 'El nombre es obligatorio.',
  'Something went wrong on the server.': 'Algo salió mal en el servidor.',
};
const translate = (message, lang) => (lang === 'es' && ES[message]) || message;
module.exports = { translate };
