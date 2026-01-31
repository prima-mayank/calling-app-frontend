import { ADD_PEER, REMOVE_PEER } from "../Actions/peerAction";

export const peerReducer = (state, action) => {
  switch (action.type) {
    case ADD_PEER:
      return {
        ...state,
        [action.payload.peerId]: {
          stream: action.payload.stream
        }
      };

    case REMOVE_PEER: {
      const newState = { ...state };
      delete newState[action.payload.peerId];
      return newState;
    }

    default:
      return state;
  }
};
